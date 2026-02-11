<h1 align="center">⚡ Apply Pilot<br><sub>Automation That Feels Alive</sub></h1>

<!-- Human-like, State-aware Auto-typing System built for `live coding`, `tutorial recording`, `technical interviews`, `demos`, `workflow automation`, and `distraction-free automation` - without sounding like a robot. -->

<p align="center" style="display:flex; gap:10px; flex-wrap: wrap; justify-content:center;">
  <a href="#"><img src="https://img.shields.io/badge/AP-Apply_Pilot-FF66C4?style=for-the-badge&logo=hyper&logoColor=white&labelColor=1D1D2C"></a>
  <a href="#"><img src="https://img.shields.io/badge/Maintained-Yes-00FFB7?style=for-the-badge&logo=github&logoColor=white&labelColor=0F172A"></a>
  <a href="#"><img src="https://img.shields.io/badge/Category-Automation-1E90FF?style=for-the-badge&logo=fastapi&logoColor=white&labelColor=0F172A"></a>
  <a href="#"><img src="https://img.shields.io/badge/Purpose-Job_Automation-FFA500?style=for-the-badge&logo=python&logoColor=white&labelColor=0F172A"></a>
</p>

---

<!-- ![Sender UI](static/hero.jpg) -->

<!-- --- -->

<!-- > AutoTyper separates **control** from **execution**.  
> A browser-based  `sender` issues commands, while a lightweight `receiver` performs realistic typing directly into any focused application (IDE, editor, browser, terminal). -->


## 💡 Overview
<!-- AutoTyper is an automated typing tool designed to simulate natural typing behavior, useful for testing, automation, or productivity applications. It consists of two main components: the `Sender` (client-side) and the `Receiver` (server-side). The Sender sends messages to the Receiver to simulate typing actions, while the Receiver manages these commands and processes them.

The **Sender** provides a web interface where users can input messages or code, configure typing speed, and control the typing process (start, stop, pause, resume, etc.). The **Receiver** listens for incoming commands from the Sender, processes them, and simulates typing in a terminal or browser environment.

This project is built using **WebSockets** for real-time communication between the Sender and Receiver. -->

---

## 📁 Repository Structure Breakdown

```
AutoType/
├── <extension>
│
├── <web and userDB>
│
├── <server>
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── manifest.json
├── .gitignore
└── README.md
```

### 📁 \<extension\>

```
app/
├── <popup ui>
│
├── <content script modules>
│
├── models
│   └── bge-base-en-v1.5
│       ├── onnx
│       │   └── ...
│       ├── config.json
│       ├── quantize_config.json
│       ├── README.md
│       ├── special_tokens_map.json
│       ├── tokenizer.json
│       ├── tokenizer_config.json
│       └── vocab.txt
│
├── offscreen
│   ├── offscreen.html
│   └── offscreen.js
│
├── scripts
│   ├── generateLabelEmbeddings.js
│   ├── generateThresholds.js
│   └── similarity.js
│
├── services
│   └── gmail.js
│
├── shared
│   ├── config
│   │   ├── atsConfig.js
│   │   ├── config.js
│   │   ├── jobBoardConfig.js
│   │   └── labelConfig.js
│   ├── utils
│   │   ├── atsUtils.js
│   │   ├── jobBoardUtils.js
│   │   ├── labelUtils.js
│   │   ├── settings.js
│   │   └── utility.js
│   └── labelEmbeddings.json
│
├── background.js
└── content.js
```

### 📁 \<extension\> 🔹 \<popup ui\>

```
ui/
├── css
│   ├── ats
│   ├── jobboard
│   └── bootstrap.min.css
├── scripts
│   ├── ats
│   ├── jobboard
│   │   ├── hiringcafe.js
│   │   └── jobrights.js
│   └── utils
│       ├── ats.js
│       ├── jobboard.js
│       └── shared.js
├── popup.css
├── popup.html
└── popup.js
```

### 📁 \<extension\> 🔹 \<content script modules\>

```
modules/
├── ats
│   ├── config
│   │   ├── greenhouseConfig.js
│   │   └── workdayConfig.js
│   ├── utils
│   │   ├── greenhouseUtils.js
│   │   └── workdayUtils.js
│   ├── greenhouse.js
│   └── workday.js
├── form
│   ├── formHandlers.js
│   ├── formResolver.js
│   └── formUtils.js
├── jobBoards
│   ├── config
│   │   ├── hiringcafeConfig.js
│   │   └── jobrightsConfig.js
│   ├── utils
│   │   ├── hiringcafeUtils.js
│   │   └── jobrightsUtils.js
│   ├── hiringcafe.js
│   └── jobrights.js
└── registry.js
```

### 📁 \<web and userDB\>

```
web/
├── public
│   ├── jobs
│   │   ├── index.html
│   │   ├── jobs.css
│   │   └── jobs.js
│   ├── app.js
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── utility.html
├── uploads
│   ├── achievements
│   │   └── uuid
│   │       └── *.pdf
│   │   └── ...
│   ├── projects
│   │   └── uuid
│   │       └── *.pdf
│   │   └── ...
│   └── resumes
│   │   └── uuid
│   │       └── *.pdf
│   │   └── ...
├── fileUtils.js
├── package-lock.json
├── package.json
├── server.js
├── test-server.js
└── userData.json
```


### 📁 \<server\>

```
server
├── app
│   ├── services
│   │   ├── database.py
│   │   ├── get_best_fit_resume.py
│   │   ├── get_nearest_address.py
│   │   ├── question_resolver.py
│   │   ├── run_jobs.py
│   │   ├── search_chatgpt.py
│   │   └── shared.py
│   └── server.py
├── config
│   └── env_config.py
├── modules
│   ├── breakpoint_notifier
│   │   ├── sounds
│   │   │   └── radiant-sound.wav
│   │   └── breakpoint_notifier.py
│   ├── browser
│   │   ├── assets
│   │   │   └── tor_connected_successfully.png
│   │   └── browser_utils.py
│   ├── chatgpt
│   │   ├── assets
│   │   │   └── human_verification_checkbox.png
│   │   └── chatgpt.py
│   ├── utils
│   │   ├── assets
│   │   ├── helpers.py
│   │   ├── js_utils.py
│   │   └── pyautogui_utils.py
│   └── __init__.py
├── credentials
└── tokens
```



## 🚀 Installation & Setup

### 📦 Clone

    ```bash
    git clone https://github.com/kalpthakkar/ApplyPilot.git
    cd ApplyPilot
    ```

### 📦 Install Dependencies

1. Browser Extension (Node.js)

    ```bash
    npm install
    ```

2. Web Server (Node.js)

    ```bash
    npm install --prefix web
    ```

3. Python Backend (Flask)

    ```bash
    cd server
    python -m venv venv  # optional, if you want a fresh env
    source venv/bin/activate  # Linux/macOS
    venv\Scripts\activate     # Windows
    pip install -r requirements.txt
    ```

### 🔮 Configure Environment Variables

Copy the template

    ```bash
    cp .env.example .env
    ```

    > ⚙️ Edit `.env` with your preferred values
    > - FAILURE_ACTION: "CONTINUE" | "ALERT_STOP" | "SILENT_STOP"
    > - RUNNER_ID: Custom name for this machine
    > - SUPERBASE_PROJECT_ID / SUPERBASE_API_KEY: Your Supabase credentials
    > - TESSERACT_PATH: Path to Tesseract executable
    > - BROWSER_NAME / PATH: Chrome or Brave executable path
    > - etc...

### 👁️ Install & Configure Tesseract

#### Windows

- Download from [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)

- Direct download from [SourceForge tesseract‑ocr‑alt downloads](https://sourceforge.net/projects/tesseract-ocr-alt/files/)

- Install and note the path (e.g., `C:\Program Files\Tesseract-OCR\tesseract.exe`)

- Update `TESSERACT_PATH` in `.env`

#### Linux / macOS

    ```bash
    sudo apt install tesseract-ocr   # Linux
    brew install tesseract           # macOS
    ```

⚡ Use which tesseract to find the path and update .env.



### 📥 Receiver Setup

The Receiver script is a Python-based backend that listens for incoming requests and communicates with the Sender using WebSockets.

3. Get your **IPv4 Address**:
    - Open Command Prompt or Terminal on your system.
    - Run `ipconfig` (Windows) or `ifconfig` (Linux/macOS) and note down your **IPv4 Address**.
    - Note this IP address for the Sender.

4. Run the Receiver server:
    ```bash
    python receiver.py
    ```

5. The server should now be running on port `8000`.
    - You should see a message like:
      ```json
      {"status":"ok","service":"AutoType Receiver","ws":"/ws/status"}
      ```
      when opening [localhost:8000](http://localhost:8000).

#### 🌍 WAN Setup (Cloudflare Tunnel) - Optional

To expose the Receiver to the internet, you can use a **Cloudflare Tunnel**:

6. Install `cloudflared`:
    - **Windows:** MSI installer  
    - **macOS:** `brew install cloudflare/cloudflare/cloudflared`  
    - **Linux:** tarball or package manager  
    [Cloudflare Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation)

7. Authenticate (if needed):
    ```bash
    cloudflared login
    ```

8. Run a tunnel pointing to your local Receiver:
    ```bash
    cloudflared tunnel --url http://localhost:8000
    ```
    - This will generate a public URL like `https://<subdomain>.trycloudflare.com`.

9. Note the generated URL for the Sender setup.

> 💡 For a visual step-by-step guide, check the Cloudflare setup screenshots [here](static/cloudflare-setup).

### 📤 Sender Setup

The Sender is a Python script that connects to the Receiver's WebSocket server. It provides a web interface for sending and controlling typing tasks.

#### LAN

3. Run the Sender with the Receiver's IP address:
    ```bash
    python sender_web/app.py <receiver_url>

    ```

    Replace `<receiver_url>` with the following format, where `<receiver-ip>` is the IP address of the Receiver:
    ```bash
    http://<receiver-ip>:8000
    ```

#### WAN

3. Run the Sender with the public tunnel URL:
    ```bash
    python sender_web/app.py https://<generated-subdomain>.trycloudflare.com
    ```

4. The Sender will run on port `5000`. You can access the control panel at:
    - [http://localhost:5000](http://localhost:5000)  
    - or [http://127.0.0.1:5000](http://127.0.0.1:5000)
    
    ![Control Panel](static/control-panel.png)

---

## 🌟 Usage

1. Focus any application where typing should occur

2. Paste content into the Sender UI

3. Configure typing options (speed, humanizer, code mode, normalize, etc)

4. Click Run

5. Pause, resume, or stop anytime

AutoTyper types **only into the currently focused window.**

> **💡 Note:** The set speed gets override when `humanize` is `enabled` and only partially contributes to the typing behavior.

---

## ✨ Core Capabilities

### 🧠 Human-Like Typing
![Human Like Typing](static/human-typing.jpg)
```text
• Variable speed per character
• Natural hesitations
• Realistic typos with correction
• Punctuation-aware pauses
```

### 🧾 Code-Aware Execution - Code Mode
```text
• Detects indentation style (tabs vs spaces)
• Syncs indentation with active IDE
• Optional normalization (strip leading whitespace)
• Safe recovery if code mode toggles mid-typing
```

### 🧬 Full Typing State Machine
![State Machine](static/panel.jpg)
```text
idle → preparing → typing → paused → completed

• Pause / resume without losing progress
• Auto-pause after each line (teaching mode)
• Safe stop at any time
```

### 🌍 Web-Based Control Panel
```text
• Paste text or code
• Start / pause / resume / stop
• Toggle features live
• Visual progress tracking
• WebSocket-based real-time status updates
```

---

## 🤔 Why AutoTyper Exists

🧨 Traditional auto-typers are:
- too fast,
- too uniform,
- unaware of code structure,
- impossible to control once started.

AutoTyper treats typing as a **stateful, interruptible process**, not a blind key spammer.

**🔦 Insight**  
Typing is *interactive*. Humans pause, hesitate, align indentation, resume, and recover mid-line.

**🔥 Solution**  
AutoTyper introduces:
- **typing state machine**
- **token-aware execution**
- **real-time pause/resume**
- **IDE-safe code alignment**

All controlled remotely - without touching the target machine.

---

## 🪄 Features

![Typing Img](static/typing.jpg)

- **Real-time Web Interface**: Interact with the Sender via a web interface.
- **Line Tracking**: See percentage completion on control panel.
- **Typing Simulation**: Simulate typing with configurable speed, pauses, and true human-like typing behaviour.
- **Auto Pause**: Automatically pauses typing after each line for more controlled typing.
- **Normalize Whitespace**: Normalize leading spaces/tabs for more predictable typing.
- **WebSocket Communication**: Real-time two-way communication between Sender and Receiver via WebSockets.
- **Cross-Platform**: Both Sender and Receiver can run on various platforms (Windows, Linux, macOS).

---

## 🚧 Limitations

⚠️ **Intentional constraints:**
- Types into foreground window only
- No background or headless mode
- Requires screen focus
- Not intended for bulk automation or bots
- AutoTyper is optimized for human-facing interaction, not throughput.

---

## 🍃 Ideal Use Cases

- 🎥 Live coding demos
- 🎓 Teaching & workshops
- 🧑‍💻 Interviews
- 📺 Screen recordings
- ✍️ Writing with presence

---

## 🌱 Future Roadmap

- Per-line speed profiles
- Multi-cursor simulation
- Typing macros / bookmarks
- Scriptable typing sessions
- Recorder → replay mode

---

## 🤝 Contributing

Contributions are welcome - especially in:
- Typing realism
- State machine robustness
- UI polish
- Platform compatibility

Open an issue before large changes.

---

## ❤️ Acknowledgements

- `pyautogui` for cross-platform input control
- `FastAPI` for clean async APIs
- `Tailwind CSS` for UI ergonomics

---

## 📞 Contact

For any inquiries or support, please contact:

- **Kalp Thakkar** - [kalpthakkar2001@gmail.com](mailto:kalpthakkar2001@gmail.com)
- **GitHub**: [kalpthakkar](https://github.com/kalpthakkar)
- **LinkedIn**: [kalpthakkar](https://www.linkedin.com/in/kalpthakkar)

<h3 align="center">⚡ AutoTyper • Typing that feels alive. ⚡</h3>