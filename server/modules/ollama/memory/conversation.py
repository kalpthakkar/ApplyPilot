# server\modules\ollama\memory\conversation.py
from typing import List, Dict, Optional

class Conversation:
    def __init__(self, window_size: Optional[int] = None):
        """
        window_size: number of recent messages to retain (rolling). 
        None = no sliding window (store everything)
        """
        self.window_size = window_size
        self.persistent_messages: List[Dict[str, str]] = []
        self.rolling_messages: List[Dict[str, str]] = []

    def add_message(self, role: str, content: str, persist: bool = False):
        message = {"role": role, "content": content}

        if persist:
            self.persistent_messages.append(message)
        else:
            self.rolling_messages.append(message)
            self._enforce_window()

    def _enforce_window(self):
        if self.window_size is not None and len(self.rolling_messages) > self.window_size:
            overflow = len(self.rolling_messages) - self.window_size
            self.rolling_messages = self.rolling_messages[overflow:]

    def get_messages(self) -> List[Dict[str, str]]:
        # Preserved first, then rolling
        return self.persistent_messages + self.rolling_messages

    def reset(self):
        self.rolling_messages = []

    def clear_all(self):
        self.persistent_messages = []
        self.rolling_messages = []
