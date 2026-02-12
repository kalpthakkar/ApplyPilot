from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from config.env_config import *
from app.services.shared import automation_controller
from app.services.run_jobs import Jobs, ExecutionResult
from app.services.question_resolver.browser_question_resolver import resolve_questions as resolve_questions_with_browser
from app.services.question_resolver.ollama_question_resolver import ollama_question_resolver
from app.services.get_best_fit_resume import get_best_fit_resume, ResumeMetaModel
from app.services.get_nearest_address import get_nearest_address, GetNearestAddressResponse
from typing import Literal, Dict, Any
import threading
import queue
import time
import json

app = Flask(__name__)
CORS(app)

# Queue for server → client messages
job_status_queue = queue.Queue()
sse_clients = set()
sse_lock = threading.Lock()
def broadcast_sse(message: str):
    with sse_lock:
        for client_queue in list(sse_clients):
            try:
                client_queue.put_nowait(message)
            except Exception:
                pass

jobs = Jobs(RUNNER_ID)



'''
------------------------------------------------------------------------------------------
Job Status Stream Service
------------------------------------------------------------------------------------------
'''
@app.route("/job-status", methods=["GET"])
def job_status():
    return jsonify({
        "isRunnerActive": automation_controller.is_automation_active    
})

# SSE endpoint
@app.route('/job-status-stream')
def job_status_stream():
    def event_stream():
        client_queue = queue.Queue()

        # Register client
        with sse_lock:
            sse_clients.add(client_queue)

        try:
            last_ping = time.time()

            while True:
                try:
                    # Wait max 15s for message
                    msg = client_queue.get(timeout=15)
                    yield f"data: {msg}\n\n"
                except queue.Empty:
                    # Heartbeat every 15s
                    yield "event: ping\ndata: keepalive\n\n"

        except GeneratorExit:
            # Client disconnected
            pass
        finally:
            with sse_lock:
                sse_clients.discard(client_queue)

    return Response(event_stream(), mimetype="text/event-stream")


'''
------------------------------------------------------------------------------------------
Core Services
------------------------------------------------------------------------------------------
'''
@app.route("/run-jobs", methods=["POST"])
def handle_run_jobs():
    if automation_controller.is_automation_active:
        return jsonify({"success": False, "error": "Runner already active"}), 409

    response = jobs.start()

    if response['success'] == False:
        if response.get('reason') == 'automation_already_running':
            return jsonify({"success": True}), 200
        else:
            broadcast_sse("jobs_stopped")
            return jsonify({"success": False}), 400

    if response['success'] == True:
        if response.get('reason') == 'all_jobs_completed':
            broadcast_sse("all_jobs_completed")

    return jsonify({"success": True}), 200

@app.route('/get-nearest-address', methods=['POST'])
def handle_get_nearest_address():

    # --- 1️⃣ Try JSON body first ---
    data = request.get_json(silent=True) or {}
    location: str | None = data.get("location", None)
    # --- 2️⃣ Fallback: raw string body ---
    if not location:
        location = request.get_data(as_text=True).strip()
    # --- 3️⃣ Validate input ---
    if not location:
        return jsonify({"success": False, "payload": None, "errors": ["No location provided"]}), 400
    
    if not automation_controller.open_llm_session('get-nearest-address'):
        print("⚠️ Error Opening LLM Session")
        return jsonify({"success": False, "payload": None, "errors": ["Error Opening LLM Session"]}), 400
    # --- 4️⃣ Call service ---
    response: GetNearestAddressResponse = get_nearest_address(location)
    automation_controller.goto_automation_desktop()

    return jsonify(response)

@app.route('/get-best-fit-resume', methods=['POST'])
def handle_get_best_fit_resume():
    data = request.json

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request"}), 404

    if not automation_controller.open_llm_session('get-best-fit-resume'):
        print("⚠️ Error Opening LLM Session")
        return jsonify({"error": "Error Opening LLM Session"}), 404
    # --- Call service ---
    response: ResumeMetaModel | None = get_best_fit_resume(data) or None
    automation_controller.goto_automation_desktop()

    if response is None:
        return jsonify({"error": "No resume found"}), 404
    return jsonify(response.model_dump())  # Convert model-to-dict at the boundary

@app.route('/resolve-questions-with-llm', methods=['POST'])
def handle_resolve_questions():

    data: dict = request.json

    # Base return
    if not isinstance(data, dict) or not all(arg in data for arg in ['questions', 'job_details']):
        print("Invalid or missing JSON body", data if not isinstance(data, dict) else ('Keys:' + list(data.keys())))
        return jsonify({"success": False, "payload": None, "errors": ["Invalid or missing JSON body"]}), 400
    
    # Execute Question Resolver
    if LLM_MODE_QUESTION_RESOLVER == "BROWSER":
        response: List[Dict[str, Any] | None] = resolve_questions_with_browser(data['questions'], data['job_details']) or None
    elif LLM_MODE_QUESTION_RESOLVER == "OLLAMA":
        response: List[Dict[str, Any] | None] = ollama_question_resolver.resolve_questions(
            data['questions'], 
            data['job_details'], 
            persist_system_prompt=False, 
            persist_context_prompt=False
        ) or None
    else:
        return jsonify({"success": False, "payload": None, "errors": ["Invalid LLM_MODE_QUESTION_RESOLVER in env"]}), 400
    
    # Update UI
    automation_controller.goto_automation_desktop()

    # Return
    return jsonify({"success": True, "payload": response, "errors": []}), 200

@app.route("/set-job-execution-result", methods=["POST"])
def handle_set_job_execution_result() -> Dict[Literal['success', 'errors'], bool | List[str]]:
    
    data: dict = request.json
    print("🏁 Execution Result Received:", data.get('result'))

    # Base Return
    if (not isinstance(data, dict)):
        return jsonify({"success": False, "errors": ["Invalid or missing JSON body"]})  
    if (not all(arg in data for arg in ['result', 'id', 'fingerprint', 'soft_data', 'source'])) or (data['result'] not in ExecutionResult._value2member_map_):
        return jsonify({"success": False, "errors": ["Invalid JSON Body"]})
    
    if LLM_MODE_QUESTION_RESOLVER == "OLLAMA":
        ollama_question_resolver.close_session()

    # Update Database
    statusSetResponse = jobs.set_execution_result(
        ExecutionResult(data['result']), 
        data['id'], 
        data['fingerprint'], 
        data["soft_data"], 
        data["source"]
    )
    
    if statusSetResponse.get('success', False) == False:
        errors = []
        error = statusSetResponse.get('error', '')
        errors.append(error if error else 'Failed to set status')
        reason = statusSetResponse.get('reason', None)
        if reason: errors.append(reason)
        print("------------------- End 🔸 Failed ---------------------------")
        return jsonify({"success": False, "errors": errors})

    return jsonify({"success": True, "errors": []})


@app.route("/stop-run-jobs", methods=["POST"])
def handle_stop_run_jobs():
    jobs.chain_enabled = False
    broadcast_sse("jobs_stopped")
    return jsonify({"success": True}), 200

'''
------------------------------------------------------------------------------------------
Start Server
------------------------------------------------------------------------------------------
'''
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, threaded=True)
