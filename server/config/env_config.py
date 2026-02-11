import os
import json
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Dict

env_path = Path(__file__).resolve().parents[1] / '.env'
load_dotenv(dotenv_path=env_path)

# 🔗 Project root directory
PROJECT_ROOT = Path(__file__).resolve().parents[2]
SERVER_ROOT = Path(__file__).resolve().parents[1]

# =========================
# Automation Configuration
# =========================
FAILURE_ACTION = os.getenv("FAILURE_ACTION", "ALERT_STOP")

# =========================
# API Configuration | Supabase Configuration
# =========================
RUNNER_ID = os.getenv("RUNNER_ID", "UNKNOWN") # Host
SUPERBASE_PROJECT_ID = os.getenv("SUPERBASE_PROJECT_ID", "demo_project_id")
SUPERBASE_API_KEY = os.getenv("SUPERBASE_API_KEY", "demo_api_key")
SUPERBASE_TABLE = os.getenv("SUPERBASE_TABLE", "json_store")


# =========================
# Project Structure Configuration
# =========================
# 📁 User database directory (relative to PROJECT_ROOT)
USER_DATABASE_DIR = PROJECT_ROOT / os.getenv("USER_DATABASE_DIR", "web")
# 📄 User data file
USER_DATA_FILE = USER_DATABASE_DIR / os.getenv("USER_DATA_FILE", "userData.json")
# 📝 Upload directories
USER_RESUMES_ROOT = USER_DATABASE_DIR / os.getenv("USER_RESUMES_DIR", "uploads/resumes")
USER_PROJECTS_ROOT = USER_DATABASE_DIR / os.getenv("USER_PROJECTS_DIR", "uploads/projects")
USER_ACHIEVEMENTS_ROOT = USER_DATABASE_DIR / os.getenv("USER_ACHIEVEMENTS_DIR", "uploads/achievements")


# =========================
# Automation Modules Configuration
# =========================
# 🔗 Tesseract OCR path
TESSERACT_PATH = Path(os.getenv("TESSERACT_PATH", "tesseract"))
# Get the browser name from the environment variable
BROWSER_NAME = os.getenv("BROWSER_NAME")
USE_TOR = (BROWSER_NAME == "Brave") and (os.getenv("USE_TOR", "false").lower() == "true")
# Based on the selected browser, set the appropriate path
if BROWSER_NAME == "Brave":
    BROWSER_PATH = Path(os.getenv("BRAVE_PATH", "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"))
elif BROWSER_NAME == "Chrome":
    BROWSER_PATH = Path(os.getenv("CHROME_PATH", "C:/Program Files/Google/Chrome/Application/chrome.exe"))
else:
    raise ValueError("Unsupported browser selected in the environment configuration.")
BRAVE_PATH = Path(os.getenv("BRAVE_PATH", "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"))
CHROME_PATH = Path(os.getenv("CHROME_PATH", "C:/Program Files/Google/Chrome/Application/chrome.exe"))
# DRIVER_PATH = PROJECT_ROOT / os.getenv("DRIVER_PATH", "config/chromedriver-win64/chromedriver.exe")


# =========================
# ASSERT Before Starting the Server
# =========================
# Make sure directories exist
USER_DATABASE_DIR.mkdir(parents=True, exist_ok=True)
USER_RESUMES_ROOT.mkdir(parents=True, exist_ok=True)
USER_PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)
USER_ACHIEVEMENTS_ROOT.mkdir(parents=True, exist_ok=True)
assert BROWSER_NAME in ["Brave", "Chrome"], f"❌ BROWSER_NAME must be 'Brave' or 'Chrome', got: {BROWSER_NAME}"
# assert DRIVER_PATH, "❌ DRIVER_PATH not set in .env"
assert USER_RESUMES_ROOT, "❌ RESUME_ROOT not set in .env"
if not BROWSER_PATH.exists(): raise FileNotFoundError(f"Browser executable not found at: {BROWSER_PATH}")

