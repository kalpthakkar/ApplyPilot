# server\app\services\question_resolver\ollama_question_resolver.py

import json
import time
from typing import List, Dict, Any, Optional

from modules.ollama.services.interaction_service import InteractionService
from modules.ollama.chain.prompt_models import PromptStep
from modules.ollama.core.enums import PromptRole, ResponseFormat

from config.env_config import OLLAMA_MODEL_NAME
from app.services.question_resolver.prompts.prompt_store import (
    # Base Prompts
    get_system_prompt, 
    get_user_context_prompt,
    # Question Type Specific Prompts
    get_question_prompt
)
from app.services.question_resolver.utils import (
    extract_db_snippets, 
    get_user_db, 
    get_parsed_response,
)


class OllamaQuestionResolver:

    def __init__(
        self,
        model: str = OLLAMA_MODEL_NAME,
        window_size: int = 3,
        max_retries: int = 2,
    ):
        self.service = InteractionService(default_model=model)
        self.window_size = window_size
        self.max_retries = max_retries
        self.session_id: Optional[str] = None
        self.cache_response: bool = True
        self.cached_response: Dict[str, str] = {}
        self.system_prompt_loaded = False
        self.context_prompt_loaded = False

    # ============================================================
    # SESSION MANAGEMENT
    # ============================================================

    def open_session(self):
        """
        Create new session and inject persistent system + context prompts.
        """
        self.session_id = self.service.create_session()
        self.service.set_window_size(self.window_size, self.session_id)

    def close_session(self):
        if self.session_id:
            self.service.close_session(self.session_id)
            self.session_id = None
            self.cached_response = {}
            self.system_prompt_loaded = False
            self.context_prompt_loaded = False

    def reset_session_memory(self):
        """
        Clears rolling messages but keeps persistent ones.
        """
        if self.session_id:
            self.service.reset_session(self.session_id)
    
    def clear_session_memory(self):
        """
        Clears rolling & persistent messages.
        """
        if self.session_id:
            self.service.clear_session(self.session_id)

    # ============================================================
    # QUESTION RESOLUTION
    # ============================================================

    def resolve_questions(self, questions: List[Dict[str, Any]], job_details: Dict[str, str | List[str] | None], persist_system_prompt:bool = False, persist_context_prompt: bool = False)  -> List[Optional[Dict[str, Any]]]:

        print("\n[Question Resolver - Ollama] 🚀 Starting LLM Question Resolution")

        user_db: Dict[str, Any] = get_user_db()

        if not self.session_id:
            self.open_session()

        final_results = [{"questionId": q["questionId"], "response": None} for q in questions]

        # Separate questions that need LLM call vs already cached
        remaining = []
        for idx, q in enumerate(questions):
            qid = q["questionId"]
            if qid in self.cached_response:
                # Directly use cached response
                final_results[idx]["response"] = self.cached_response[qid]
            else:
                # Needs LLM call
                remaining.append((idx, q))

        attempt = 0

        while remaining and attempt <= self.max_retries:
            attempt += 1

            print(f"[Question Resolver - Ollama] 🔁 LLM attempt {attempt} — resolving {len(remaining)} question(s)")

            indices, batch = zip(*remaining)

            chain: List[PromptStep] = []

            # ============================================================
            # Build Prompt Chain
            # ============================================================

            if not self.system_prompt_loaded:
                chain.append(PromptStep(
                    role=PromptRole.SYSTEM,
                    content=get_system_prompt(job_details),
                    persist=persist_system_prompt,
                    expect_response=False,
                ))
                self.system_prompt_loaded = True

            if not self.context_prompt_loaded:
                chain.append(PromptStep(
                    role=PromptRole.USER,
                    content=get_user_context_prompt(user_db),
                    persist=persist_context_prompt,
                    expect_response=False,
                ))
                self.context_prompt_loaded = True

            for question in batch:

                try:
                    db_snippets = extract_db_snippets( user_db, question.get("relevantDBKeys", []) )
                except:
                    db_snippets = {}

                prompt_text, json_schema = get_question_prompt(question, db_snippets, supports_schema= True)

                chain.append(
                    PromptStep(
                        role=PromptRole.USER,
                        content=prompt_text,
                        persist=False,                 # rolling
                        persist_response=False,        # keep memory lean
                        expect_response=True,
                        response_format=ResponseFormat.JSON,
                        json_schema=None,
                    )
                )

            # ============================================================
            # Invoke LLM
            # ============================================================
            try:
                responses = self.service.run_chain(self.session_id, chain)
            except Exception as e:
                print("⚠️ LLM stalled. Resetting session.")
                self.clear_session_memory()
                self.system_prompt_loaded = False
                self.context_prompt_loaded = False
                continue

            # ============================================================
            # Parse Response
            # ============================================================
            # ---------- SAFETY CHECK ----------
            if len(responses) != len(indices):
                print(f"[Question Resolver - Ollama] ⚠️ Payload length mismatch: expected {len(indices)}, got {len(responses)}")
                time.sleep(1)
                continue

            new_remaining = []

            # Parse each response
            for idx, raw in zip(indices, responses):
                try:
                    # Set value
                    value = get_parsed_response(raw)
                    final_results[idx]["response"] = value
                    if self.cache_response:
                        self.cached_response[questions[idx]["questionId"]] = value
                except Exception as e:
                    print(f"[Question Resolver - Ollama] ❌ Parsing failed for questionId {questions[idx]["questionId"]}: {e}")
                    print(f"[Question Resolver - Ollama] Raw response: {raw}") # optional, useful for debugging/retrying
                    new_remaining.append((idx, questions[idx])) # retry only failed questions

            remaining = new_remaining

            if remaining:
                print(f"[Question Resolver - Ollama] ⚠️ {len(remaining)} question(s) failed parsing — retrying")
                time.sleep(0.8)

        print(f"[Question Resolver - Ollama] 💡 Returning Answers: {len(questions) - len(remaining)} resolved / {len(questions)}\n")
        if not persist_system_prompt: self.system_prompt_loaded = False
        if not persist_context_prompt: self.context_prompt_loaded = False
        return final_results


ollama_question_resolver = OllamaQuestionResolver(model=OLLAMA_MODEL_NAME, window_size=3, max_retries=2)


if __name__ == "__main__":

    import pprint
    import time

    from app.services.question_resolver.ollama_question_resolver import OllamaQuestionResolver

    # ============================================================
    # Test Harness for OllamaQuestionResolver
    # ============================================================

    # print("\n[OllamaQuestionResolver] 🚀 Starting LLM Question Resolution Test\n")

    # -------------------------
    # Mock User DB (via patching get_user_db if needed)
    # -------------------------
    # For this test, we rely on the module’s get_user_db function, which could be mocked
    # if you want to control the returned data. We'll simulate typical user data:
    mock_user_db = {
        "email": "alice@example.com",
        "username": "alice123",
        "firstName": "Alice",
        "lastName": "Wonder",
        "birthDate": "1990-05-20",
        "linkedin": "https://linkedin.com/in/alicewonder",
        "skills": ["Python", "Django", "Vue.js"],
        "workExperiences": [
            {
                "jobTitle": "Backend Developer",
                "company": "WebSolutions",
                "startDate": "2021-02-01",
                "endDate": "2023-01-31",
                "roleDescription": "Built APIs and microservices"
            }
        ]
    }

    # -------------------------
    # Mock Job Details
    # -------------------------
    job_details = {
        "title": "Backend Engineer",
        "description": "Develop RESTful APIs and integrate with front-end services.",
        "jobURL": "https://example.com/jobs/backend",
        "location": "New York, NY"
    }

    # -------------------------
    # Mock Questions
    # -------------------------
    questions_batch_1 = [
        {
            "questionId": "q1",
            "labelText": "What is your first name?",
            "type": "text",
            "relevantDBKeys": ["firstName"]
        },
        {
            "questionId": "q2",
            "labelText": "What is your email address?",
            "type": "email",
            "relevantDBKeys": ["email"]
        },
        # {
        #     "questionId": "q3",
        #     "labelText": "Choose your main skill",
        #     "type": "select",
        #     "options": ["Python", "Java", "C#", "JavaScript"],
        #     "relevantDBKeys": ["skills"]
        # },
        # {
        #     "questionId": "q4",
        #     "labelText": "Describe your last job role",
        #     "type": "textarea",
        #     "relevantDBKeys": ["workExperiences"]
        # }
    ]

    questions_batch_2 = [
        {
            "questionId": "q2",
            "labelText": "What is your email address?",
            "type": "email",
            "relevantDBKeys": ["email"]
        },
        # {
        #     "questionId": "q4",
        #     "labelText": "Describe your last job role",
        #     "type": "textarea",
        #     "relevantDBKeys": ["workExperiences"]
        # }
    ]

    # -------------------------
    # Initialize Resolver
    # -------------------------
    resolver = OllamaQuestionResolver(model="phi3:latest", window_size=3, max_retries=2)

    # -------------------------
    # Resolve Questions Batch 1
    # -------------------------
    print("\n[TEST] Resolving Questions Batch 1\n")
    results_1 = resolver.resolve_questions(
        questions_batch_1, 
        job_details, 
        persist_system_prompt=True,
        persist_context_prompt=False
    )
    print("\n===== LLM Responses Batch 1 =====")
    for res in results_1:
        print(f"\nQuestionId: {res['questionId']}")
        pprint.pprint(res["response"])

    print("\nWaiting 3 seconds before next batch...\n")
    time.sleep(3)

    # -------------------------
    # Resolve Questions Batch 2
    # -------------------------
    print("\n[TEST] Resolving Questions Batch 2\n")
    results_2 = resolver.resolve_questions(
        questions_batch_2, 
        job_details,
        persist_system_prompt=True,
        persist_context_prompt=False
    )
    print("\n===== LLM Responses Batch 2 =====")
    for res in results_2:
        print(f"\nQuestionId: {res['questionId']}")
        pprint.pprint(res["response"])

    # -------------------------
    # Close session
    # -------------------------
    resolver.close_session()

    print("\n🎯 Test Completed Successfully\n")



