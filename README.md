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
> - `FAILURE_ACTION`: "CONTINUE" | "ALERT_STOP" | "SILENT_STOP"
> - `RUNNER_ID`: Custom name for this machine
> - `SUPERBASE_PROJECT_ID` / `SUPERBASE_API_KEY`: Your Supabase credentials
> - `TESSERACT_PATH`: Path to Tesseract executable
> - `BROWSER_NAME / PATH`: Chrome or Brave executable path
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

⚡ Use which tesseract to find the path and update `.env`.


### 🤖 Label Embedding Model

The project uses the **BGE (Base Generative Embeddings)** model for label embeddings and semantic comparison in the extension’s background (offscreen). Precomputed label embeddings and thresholds are stored in `app/shared/config/labelConfig.js`, but the raw model files must be downloaded for offline computation or regeneration.

1. Clone the model repository

```bash
git clone https://huggingface.co/Xenova/bge-base-en-v1.5 app/models/bge-base-en-v1.5
```
⚡ This will download the full ONNX model files, tokenizer, and configuration JSONs required for embedding computation.

2. Verify the files (optional)
```bash
ls -lh app/models/bge-base-en-v1.5
```


### ⚠️ 6. System Permissions & Notes

#### ⚠️ Some modules require system-level access:

- Screen & Input Access (for automation scripts / pyautogui):

    - macOS: Enable Accessibility permissions in System Preferences → Security & Privacy → Privacy → Accessibility
    - Linux: Run inside an X11 session
    - Windows: Can run normally (Admin not required, but may need permissions for certain directories)

- File Uploads / Downloads: 
    
    - Ensure web/uploads and subfolders exist and are writable.

- Tor / Proxy Usage:

    - Set USE_TOR="true" in `.env` if routing through Tor is needed.

- Ensure Tor browser is installed and the path is correct.

- Supabase API Keys:

    - Keep them secure. Do not push your .env to public repos.


### Build Extension & Generate Resources

#### Generate embeddings and thresholds

```bash
npm run generate:embeddings
```
⚡ This runs `generateLabelEmbeddings.js` and `generateThresholds.js`

💬 Pre-computed embeddings are kept at `app/shared
/labelEmbeddings.json`, making this step **optional**.


#### Build the extension scripts

```bash
npm run ext:full:dev
```

⚡ Generates embeddings, thresholds, bundles all modules, and copies necessary static files.

✅ Use this on initial setup or after adding new scripts/modules.

##### Subsequent builds (dev mode, incremental/watch)

```bash
npm run ext:core:dev
```
⚡ Watches your source files and rebuilds only what changes. Faster for ongoing development.

##### Build only core modules or individual scripts

```bash
npm run ext:background     # background.js
npm run ext:content        # content.js
npm run ext:modules        # all ATS & JobBoard modules
npm run ext:gmail          # Gmail service
npm run ext:popup          # popup.js
npm run ext:offscreen      # offscreen.js
npm run copy:models        # copy pre-trained models
npm run copy:offscreen     # copy offscreen.html
```
💡 Tip: Only use individual scripts if you modify specific files — avoids rebuilding the entire extension.


### Run Web Server

```bash
npm run web:dev
```

Open your browser

#### Profile Setup

```url
http://<YOUR_IP_ADDRESS>:4000/
```
or open [localhost:4000](http://localhost:4000).

Complete your profile — this is required for automation and form-filling.

#### Job Dashboard

```url
http://<YOUR_IP_ADDRESS>:4000/jobs
```
or open [localhost:4000/jobs](http://localhost:4000/jobs).

- ⚠️ You need to setup the Database for previewing the jobs. This project uses Superbase platform for hosting jobs over Postgres SQL DB.
- ✨ Here users can track, manage, and monitor applied jobs, view execution results, and check application status.
- 🚀 The **Run All** button at the *top-right corner* will start automation, but ensure the Python server is running in the background before clicking it.


### Start Server

```url
cd server
python -m app.server
```

- ⚡ This will launch the Flask backend that the web interface communicates with.
- 📝 Make sure this is running before triggering any automation from the web dashboard.

---

## 📞 Contact

For any inquiries or support, please contact:

- **Kalp Thakkar** - [kalpthakkar2001@gmail.com](mailto:kalpthakkar2001@gmail.com)
- **GitHub**: [kalpthakkar](https://github.com/kalpthakkar)
- **LinkedIn**: [kalpthakkar](https://www.linkedin.com/in/kalpthakkar)

<h3 align="center">⚡ ApplyPilot • Automation that feels alive. ⚡</h3>