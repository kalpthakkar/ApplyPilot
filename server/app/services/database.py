# server\app\services\database.py
# -----------------------------
# Imports
# -----------------------------
from config.env_config import SUPERBASE_PROJECT_ID, SUPERBASE_API_KEY, SUPERBASE_TABLE
import requests


# -----------------------------
# Config
# -----------------------------
BASE_URL = f"https://{SUPERBASE_PROJECT_ID}.supabase.co/rest/v1/{SUPERBASE_TABLE}"
HEADERS = {
    "apikey": SUPERBASE_API_KEY,
    "Authorization": f"Bearer {SUPERBASE_API_KEY}",
    "Content-Type": "application/json"
}
RPC_URL = f"https://{SUPERBASE_PROJECT_ID}.supabase.co/rest/v1/rpc/upsert_job"
RPC_FETCH_AND_LOCK = f"https://{SUPERBASE_PROJECT_ID}.supabase.co/rest/v1/rpc/fetch_and_lock_next_job"
RPC_RESET_URL = f"https://{SUPERBASE_PROJECT_ID}.supabase.co/rest/v1/rpc/reset_processing_jobs"


def reset_processing_jobs_on_startup() -> None:
    """
    Safely resets all jobs stuck in `executionResult = processing`
    back to `pending` WITHOUT overwriting JSONB data.
    """

    response = requests.post(
        RPC_RESET_URL,
        headers=HEADERS,
        json={},  # RPC requires body, even if empty
        timeout=15
    )

    if not response.ok:
        raise RuntimeError(
            f"❌ Startup recovery failed: {response.status_code} {response.text}"
        )

    print("🔄 Startup recovery complete: processing → pending (JSONB-safe)")


# -----------------------------
# Helpers
# -----------------------------
# Fetch Job
def fetch_and_lock_next_job(runner_id: str, timeout: int = 10):
    payload = {"p_runner": runner_id}

    res = requests.post(
        RPC_FETCH_AND_LOCK,
        headers=HEADERS,
        json=payload,
        timeout=timeout
    )

    res.raise_for_status()
    return res.json() if res.content else None


# Fetch Jobs
def get_all_jobs():
    """
    Fetch pending jobs sorted by:
      1️⃣ publish_time_ts DESC (newest first)
      2️⃣ matchScore DESC (tie-breaker)
    """

    params = {
        "select": "*",
        "data->>applicationStatus": "eq.init",
        "data->>executionResult": "eq.pending",
        "order": "publish_time_ts.desc,data->>matchScore.desc"
    }

    response = requests.get(BASE_URL, headers=HEADERS, params=params)
    response.raise_for_status()

    jobs = response.json()
    print(f"📦 Pending jobs fetched: {len(jobs)}")

    return jobs


def upsert_job(
    job_key: str,
    *,
    force_update: dict | None = None,
    soft_update: dict | None = None,
    fingerprint: str | None = None,
    source: str | None = None,
    timeout: int = 10
):
    """
    Upsert a single job into Supabase via RPC.
    
    Parameters:
        job_key (str): Unique key of the job (required).
        force_update (dict | None): Keys that always overwrite existing values in JSONB.
        soft_update (dict | None): Keys that only update if not already present.
        fingerprint (str | None): Optional job fingerprint.
        source (str | None): Optional job source identifier.
        timeout (int): HTTP request timeout in seconds.
    """
    if not job_key:
        raise ValueError("job_key must be provided")

    if force_update is not None and not isinstance(force_update, dict):
        raise ValueError("force_update must be a dict")
    if soft_update is not None and not isinstance(soft_update, dict):
        raise ValueError("soft_update must be a dict")

    payload = {
        "k": job_key,
        "fingerprint": fingerprint,
        "force_data": force_update or {},
        "soft_data": soft_update or {},
        "source": source
    }

    try:
        res = requests.post(
            RPC_URL,
            headers=HEADERS,
            json=payload,
            timeout=timeout
        )
        # print("STATUS:", res.status_code)
        # print("BODY:", res.text)
        res.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError("Supabase RPC request failed") from e

    return res.json() if res.content else None
