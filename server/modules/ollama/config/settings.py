from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    DEFAULT_MODEL: str = "phi3:latest"
    TIMEOUT: tuple[int, int] = (10, 300)

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore" 
    )


settings = Settings()