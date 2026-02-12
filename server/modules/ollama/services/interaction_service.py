# server\modules\ollama\services\interaction_service.py
from typing import Dict, List, Any
from modules.ollama.memory.session import LLMSession
from modules.ollama.chain.prompt_models import PromptStep

class InteractionService:
    def __init__(self, default_model: str):
        self.default_model = default_model
        self.sessions: Dict[str, LLMSession] = {}

    def create_session(self, model: str = None) -> str:
        session = LLMSession(model=model or self.default_model)
        self.sessions[session.id] = session
        return session.id

    def get_session(self, session_id: str) -> LLMSession:
        return self.sessions[session_id]
    
    def set_window_size(self, size: int, session_id: str):
        if not isinstance(size, int):
            raise TypeError("'size' argument must be an integer.")
        self.get_session(session_id).conversation.window_size = size

    def run_chain(self, session_id: str, chain: List[PromptStep]) -> List[Any]:
        session = self.get_session(session_id)
        return session.run_chain(chain)

    def reset_session(self, session_id: str):
        self.get_session(session_id).reset()

    def clear_session(self, session_id: str):
        self.get_session(session_id).clear_all()

    def close_session(self, session_id: str):
        """Completely remove a session from memory."""
        if session_id in self.sessions:
            del self.sessions[session_id]