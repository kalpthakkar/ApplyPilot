# server\modules\ollama\memory\session.py
import uuid
from typing import List
from modules.ollama.chain.prompt_models import PromptStep
from modules.ollama.memory.conversation import Conversation
from modules.ollama.chain.chain_processor import ChainProcessor


class LLMSession:
    def __init__(self, model: str):
        self.id = str(uuid.uuid4())
        self.conversation = Conversation()
        self.processor = ChainProcessor(model=model)

    def run_chain(self, chain: list):
        return self.processor.process(self.conversation, chain)

    def reset(self):
        self.conversation.reset()

    def clear_all(self):
        self.conversation.clear_all()
