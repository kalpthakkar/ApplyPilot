# server\modules\ollama\examples\example_usage.py
from modules.ollama.core.enums import PromptRole, ResponseFormat
from modules.ollama.services.interaction_service import InteractionService
from modules.ollama.chain.prompt_models import PromptStep
import pprint

service = InteractionService(default_model="phi3:latest")
session_id = service.create_session()
service.set_window_size(5, session_id)

chain = [
    PromptStep(role=PromptRole.SYSTEM, content="You are a helpful assistant.", persist=True, expect_response=False),
    PromptStep(role=PromptRole.USER, content="Hello!", persist=False, persist_response=True, expect_response=True),
    PromptStep(
        role=PromptRole.USER,
        content="Provide JSON output with name and age.",
        persist=False,
        persist_response=True,
        expect_response=True,
        response_format=ResponseFormat.JSON,
        json_schema={
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "integer"}
            },
            "required": ["name", "age"]
        }
    )
]

results = service.run_chain(session_id, chain)
pprint.pprint(results)
