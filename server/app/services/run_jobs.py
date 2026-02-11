# app/services/run_jobs.py
from typing import Literal, List, Dict, Optional, Any
from app.services.shared import automation_controller
import time
import re
import threading
from enum import Enum
from urllib.parse import urlparse
from datetime import datetime, timezone
from app.services.database import upsert_job, fetch_and_lock_next_job, reset_processing_jobs_on_startup
from pprint import pprint
from modules.breakpoint_notifier.breakpoint_notifier import BreakpointNotifier
from config.env_config import FAILURE_ACTION

# -----------------------------
# Config
# -----------------------------
DEFAULT_JOB_TIMEOUT = 5 * 60  # 5 minutes
MAX_SUBSEQUENT_RUN_JOBS_FAILURE_ALLOWED = 3  # max attempts for CONTINUE mode
MAX_SUBSEQUENT_EXECUTION_FAILURES_ALLOWED = 5

PLATFORM_TIMEOUTS = [
    # Workday is slow
    (re.compile(r"\.myworkday(jobs|site)\.com$", re.I), 8 * 60),

    # Greenhouse is faster
    (re.compile(r"\.greenhouse\.io$", re.I), 8 * 60),

    # Lever (example)
    (re.compile(r"\.lever\.co$", re.I), 6 * 60),
]




# -----------------------------
# Enums
# -----------------------------
class ApplicationStatus(Enum):
    INIT = "init"
    IN_PROGRESS = "in_progress"
    JOB_EXPIRED = "job_expired"
    APPLIED = "applied"


class ExecutionResult(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    JOB_EXPIRED = "job_expired"
    UNSUPPORTED_PLATFORM = "unsupported_platform"
    FAILED = "failed"
    APPLIED = "applied"

class FailureAction(Enum):
    CONTINUE = "CONTINUE"
    ALERT_STOP = "ALERT_STOP"
    SILENT_STOP = "SILENT_STOP"


'''
======================================================================
HELPER FUNCTIONS
======================================================================
'''
# Set execution timeout
def resolve_job_timeout(apply_url: str) -> int:
    if not apply_url:
        return DEFAULT_JOB_TIMEOUT

    hostname = urlparse(apply_url).hostname or ""

    for pattern, timeout in PLATFORM_TIMEOUTS:
        if pattern.search(hostname):
            return timeout

    return DEFAULT_JOB_TIMEOUT

# -----------------------------
# Database Helper function
# -----------------------------
def _validate_enum(value: str, enum_cls: Enum, field_name: str):
    if value not in enum_cls._value2member_map_:
        raise ValueError(
            f"Invalid {field_name} '{value}'. Allowed values: "
            f"{', '.join(e.value for e in enum_cls)}"
        )

# -----------------------------
# Update both applicationStatus and executionResult
# -----------------------------
def update_database(job_key: str, fingerprint: str = None, application_status: ApplicationStatus = None, execution_result: ExecutionResult = None, soft_update_payload: dict | None = None, source: str | None = None, timeout: int = 10):
    """
    Update one or both of data.applicationStatus and data.executionResult for a single job row.
    """
    force_update_payload = {}

    if application_status is not None:
        _validate_enum(application_status.value, ApplicationStatus, "applicationStatus")
        force_update_payload["applicationStatus"] = application_status.value
        if application_status == ApplicationStatus.APPLIED:
            force_update_payload["applied_at"] = (
                datetime.now(timezone.utc)
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
            )

    if execution_result is not None:
        _validate_enum(execution_result.value, ExecutionResult, "executionResult")
        force_update_payload["executionResult"] = execution_result.value

    if not force_update_payload:
        raise ValueError("Nothing to update. Provide at least one of status or result.")

    upsert_job(
        job_key=job_key,
        fingerprint=fingerprint,
        force_update=force_update_payload,
        soft_update=soft_update_payload,
        source=source,
        timeout=timeout
    )

    print(f"✅ Updated → {job_key}: {force_update_payload}")


class Jobs:
    def __init__(self, runner_id: str):
        self.runner_id = runner_id
        self.current_job = None
        self.chain_enabled = False
        self.current_subsequent_execution_failure_count = 0
        self._execution_timer = None
        reset_processing_jobs_on_startup()
        self.breakpoint_notifier = BreakpointNotifier()

    def _start_execution_timeout(self, job_key: str, timeout: int):
        self._cancel_execution_timeout()

        def on_timeout():

            print(f"『⩇⩇:⩇⩇』 Job timed out: {job_key}")

            try:
                update_database(
                    job_key, 
                    execution_result=ExecutionResult.FAILED,
                    application_status=ApplicationStatus.FAILED
                )
            except Exception as e:
                print(f"Failed to update executionResult on timeout: {e}")

            # Continue pipeline
            automation_controller.close_llm_session()
            automation_controller.close_automation_session()
            self.current_job = None
            print("------------------- End 🔸 Timeout ---------------------------")
            if self.chain_enabled:
                self.run_next_job() # Continue chain

        self._execution_timer = threading.Timer(timeout, on_timeout)
        self._execution_timer.daemon = True
        self._execution_timer.start()

    def _cancel_execution_timeout(self):
        if self._execution_timer:
            self._execution_timer.cancel()
            self._execution_timer = None

    def start(self):
        return self.run_next_job()

    def run_next_job(self) -> Dict[Literal['success', 'reason'], bool | str]:
        current_subsequent_run_jobs_failure_count = 0
        while True:
            if automation_controller.is_automation_active:
                return {'success': False, 'reason': 'automation_already_running'}

            # jobs -> List[ Dict[ Literal[key, data], Any ] ]
            # job -> Dict[ Literal[key, data], Any ]
            job = fetch_and_lock_next_job(self.runner_id)

            if not job:
                print("💤 No jobs available")
                print("------------------- Completed 💎 All Jobs ---------------------------")
                return {'success': True, 'reason': 'all_jobs_completed'}

            self.current_job = job
            apply_url = job["data"].get("applyUrl")
            timeout = resolve_job_timeout(apply_url)

            print(f"🔒 Locked job {job['key']} for execution with watchdog timer {timeout}s")
            self._start_execution_timeout(job["key"], timeout)

            if apply_url:
                success = automation_controller.open_automation_session(apply_url) # (note: autofill must be enabled)
                if not success:
                    print(f"⚠️ Failed to open automation session for {job['key']}")
                    try: update_database(job['key'], execution_result=ExecutionResult.FAILED) # throws error incase failed
                    except: pass
                    if FAILURE_ACTION == FailureAction.CONTINUE:
                        current_subsequent_run_jobs_failure_count += 1
                        if current_subsequent_run_jobs_failure_count >= MAX_SUBSEQUENT_RUN_JOBS_FAILURE_ALLOWED:
                            return {'success': False, 'reason': f'faild_to_open_automation_session_with_{MAX_SUBSEQUENT_RUN_JOBS_FAILURE_ALLOWED}_retries'}
                        else:
                            automation_controller.close_llm_session()
                            automation_controller.close_automation_session()
                            self.current_job = None
                            continue # resolve next job
                    else:
                        automation_controller.is_automation_active = False
                        self.current_job = None
                        if FAILURE_ACTION == FailureAction.ALERT_STOP:
                            self.breakpoint_notifier.notify_and_keep_playing()
                            return {'success': False, 'reason': 'faild_to_open_automation_session'}
                        else: # FailureAction.SILENT_STOP
                            return {'success': False, 'reason': 'faild_to_open_automation_session'}

            else:
                if FAILURE_ACTION == FailureAction.CONTINUE:
                    automation_controller.is_automation_active = False
                    self.current_job = None
                    continue # resolve next job
                elif FAILURE_ACTION == FailureAction.ALERT_STOP:
                    self.breakpoint_notifier.notify_and_keep_playing()
                    return {'success': False, 'reason': 'job_without_applyurl_database_error'}
                else: # FailureAction.SILENT_STOP
                    return {'success': False, 'reason': 'job_without_applyurl_database_error'}


            print("------------------- Started 🔹 Running job ---------------------------")
            self.chain_enabled = True
            return {'success': True, 'reason': 'started'}
    

    # Jobs execution result, database update, and next-job in queue execution goes here.
    def set_execution_result(self, result: ExecutionResult, key: str, fingerprint: str, soft_data: dict | None, source: str | None) -> Dict[Literal['success', 'reason', 'error'], bool | str]:

        # Helper
        execution_failure_type: bool = False

        # Fix in-flight key (incase mis-compuation or link redirection by worker)
        if self.chain_enabled: key = self.current_job["key"]

        # --------------------------------------------------
        # Orphan job - on user triggered mannual application's execution completion
        # --------------------------------------------------
        is_orphan = not self.chain_enabled
        if result == ExecutionResult.PENDING and is_orphan:
            print("🔸 Orphan PENDING ignored")

            # LLM Session Stays Open For Debugging
            # Automation Session Stays Open For Debugging
            # Hard Reset params for next run.
            automation_controller.chatgpt.is_session_already_open = False
            automation_controller.chatgpt.reset_occured = False
            automation_controller.is_automation_active = False

            print("------------------- End 🔹 Success ---------------------------")
            return {"success": True, "reason": "orphan_pending_jobs_does_not_need_initialization"}
        

        # --------------------------------------------------
        # Active chain cannot accept PENDING
        # --------------------------------------------------
        # Hard stop: invalid result during active chain.
        # We intentionally tear down automation state and require manual restart
        # via /run-jobs to avoid undefined UI / browser state.
        if not is_orphan and result == ExecutionResult.PENDING:
            print(f'⚠️ Recieved Pending ExecutionResult over active chain.')
            if FAILURE_ACTION == FailureAction.CONTINUE:
                if self.current_subsequent_execution_failure_count > MAX_SUBSEQUENT_EXECUTION_FAILURES_ALLOWED:
                    automation_controller.is_automation_active = False
                    self.current_job = None
                    return {"success": False, "reason": "pending_not_allowed_for_active_chain"}
                execution_failure_type = True
            else:
                automation_controller.is_automation_active = False
                self.current_job = None
                if FAILURE_ACTION == FailureAction.ALERT_STOP:
                    self.breakpoint_notifier.notify_and_keep_playing()
                return {"success": False, "reason": "pending_not_allowed_for_active_chain"}

        # --------------------------------------------------
        # Cancel timeout watchdog
        # --------------------------------------------------
        if not is_orphan:
            self._cancel_execution_timeout()

        # Update DB, and UI. Start next Job if chain is active (current job result is not orphan)
        try:

            # -------------------- Update Database --------------------
            # ExecutionResult::: PENDING, PROCESSING, JOB_EXPIRED, UNSUPPORTED_PLATFORM, FAILED, APPLIED
            # ApplicationStatus::: INIT, IN_PROGRESS, JOB_EXPIRED, APPLIED
            
            execution_result: ExecutionResult | None = None
            application_status: ApplicationStatus | None = None

            if result == ExecutionResult.PENDING: execution_result = ExecutionResult.FAILED # ApplicationStatus stays init
            if result == ExecutionResult.JOB_EXPIRED: execution_result, application_status = ExecutionResult.JOB_EXPIRED, ApplicationStatus.JOB_EXPIRED
            if result == ExecutionResult.UNSUPPORTED_PLATFORM: execution_result = ExecutionResult.UNSUPPORTED_PLATFORM # ApplicationStatus stays init
            if result == ExecutionResult.FAILED: execution_result = ExecutionResult.FAILED # ApplicationStatus stays init
            if result == ExecutionResult.APPLIED: execution_result, application_status = ExecutionResult.APPLIED, ApplicationStatus.APPLIED
            
            if execution_result:
                try:
                    update_database(key, fingerprint=fingerprint, application_status=application_status, execution_result=execution_result, soft_update_payload=soft_data, source=source) # throws error incase failed
                except Exception as error:
                    print(f'⚠️ Failed to update database for {key} with execution result {execution_result} and application status {application_status}. Error: {error}')
                    if FAILURE_ACTION == FailureAction.CONTINUE:
                        if self.current_subsequent_execution_failure_count > MAX_SUBSEQUENT_EXECUTION_FAILURES_ALLOWED:
                            automation_controller.is_automation_active = False
                            self.current_job = None
                            return {'success': False, 'reason': 'database_updation_failure', 'error': str(error)}
                        execution_failure_type = True
                    else:
                        automation_controller.is_automation_active = False
                        self.current_job = None
                        if FAILURE_ACTION == FailureAction.ALERT_STOP:
                            self.breakpoint_notifier.notify_and_keep_playing()
                        return {'success': False, 'reason': 'database_updation_failure', 'error': str(error)}

            else:
                print(f'⚠️ Recieved Invalid ExecutionResult: {result}')
                if FAILURE_ACTION == FailureAction.CONTINUE:
                    if self.current_subsequent_execution_failure_count > MAX_SUBSEQUENT_EXECUTION_FAILURES_ALLOWED:
                        automation_controller.is_automation_active = False
                        self.current_job = None
                        return {'success': False, 'reason': 'invalid_execution_result', 'error': f'Error: {result} is invalid execution result type enum.'}
                    execution_failure_type = True
                else:
                    automation_controller.is_automation_active = False
                    self.current_job = None
                    if FAILURE_ACTION == FailureAction.ALERT_STOP:
                        self.breakpoint_notifier.notify_and_keep_playing()
                    return {'success': False, 'reason': 'invalid_execution_result', 'error': f'Error: {result} is invalid execution result type enum.'}

            # -------------------- Update UI --------------------
            automation_controller.close_llm_session()
            automation_controller.goto_automation_desktop()
            if is_orphan:
                automation_controller.is_automation_active = False
                print("------------------- End 🔹 Success ---------------------------")
                return {"success": True, 'reason': 'oprhan_job_execution_complete'}
            else: # Represents Chain of Jobs when commanded to execute all.
                automation_controller.close_automation_session()
                self.current_job = None
                print("------------------- End 🔹 Success ---------------------------")
                if self.chain_enabled:
                    if execution_failure_type: self.current_subsequent_execution_failure_count += 1
                    else: self.current_subsequent_execution_failure_count = 0
                    return self.run_next_job() # Continue chain
                else:
                    return {"success": True, "reason": "disabled_chain_ended_execution"}


        except Exception as e:
            automation_controller.is_automation_active = False
            print(f"❌ Fatal error setting execution result: {e}")
            if FAILURE_ACTION == FailureAction.ALERT_STOP:
                self.breakpoint_notifier.notify_and_keep_playing()
            # High level failure always terminates.
            return {"success": False, "reason": "fatal_error_setting_execution_result", "error": str(e)}
        
        

