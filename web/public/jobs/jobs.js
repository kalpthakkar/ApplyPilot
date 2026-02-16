/* ======================================================
   CONFIG
====================================================== */
const PROJECT_ID = "owvajbjbqhhwcznymirg";
const API_KEY = "sb_publishable_pIq55b08XKZMnqa2-JdUdQ_Jin36ree";
const BASE_URL = `https://${PROJECT_ID}.supabase.co/rest/v1/json_store`;
const API_BASE = 'http://10.0.0.199:5001';
const RPC_URL = `https://${PROJECT_ID}.supabase.co/rest/v1/rpc`;

const PAGE_SIZE = 20;

const NOT_INTERESTED_UNDO_TIMEOUT = 8 // seconds

const EXECUTION_RESULT_META = {
  pending: {
    color: 'yellow',
    tooltip: 'Automation pending'
  },
  applied: {
    color: 'green',
    tooltip: 'Job applied successfully'
  },
  failed: {
    color: 'red',
    tooltip: 'Automation failed'
  },
  job_expired: {
    color: 'orange',
    tooltip: 'Job is no longer available'
  },
  unsupported_platform: {
    color: 'gray',
    tooltip: 'Unsupported job platform'
  }
};


/* ======================================================
   STATE
====================================================== */
let jobs = [];
let page = 0;
let loading = false;
let hasMore = true;

const filters = {
  search: "",
  remote: false,
  excludeClearance: false,
  excludeCitizen: false,
  visa: false,
  hideApplied: false,
  showApplied: false
};

/* ======================================================
   ELEMENTS
====================================================== */
const jobsContainer = document.getElementById("jobsContainer");
const loadingEl = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");

/* ======================================================
   FETCH
====================================================== */
async function fetchJobs() {
  if (loading || !hasMore) return;

  loading = true;
  loadingEl.classList.remove("hidden");

  try {
    const body = {
      _limit: PAGE_SIZE,
      _offset: page * PAGE_SIZE,
      _remote: filters.remote || null,
      _exclude_clearance: filters.excludeClearance || null,
      _exclude_citizen: filters.excludeCitizen || null,
      _visa: filters.visa || null,
      _hide_applied: filters.hideApplied || null,
      _show_applied: filters.showApplied || null,
      _search: filters.search || null
    };

    const res = await fetch(`${RPC_URL}/get_jobs_sorted`, {
      method: "POST",
      headers: {
        apikey: API_KEY,
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch jobs: ${res.status} ${text}`);
    }

    const rows = await res.json();

    if (!rows.length) hasMore = false;

    jobs.push(...rows.map(r => ({
      key: r.job_key,
      data: r.job_data,
      publishTimeTs: r.publish_time_ts
    })));

    renderJobs();

    page++;
  } catch (err) {
    console.error("Error fetching jobs:", err);
  } finally {
    loading = false;
    loadingEl.classList.add("hidden");
  }
}



/* ======================================================
   RENDER
====================================================== */
function renderJobs() {
  jobsContainer.innerHTML = "";

  if (!jobs.length) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  jobs.forEach(row => {
    const d = row.data;
    // const exec = EXECUTION_UI[d.executionResult] || EXECUTION_UI.pending;
    const exec = d.executionResult || 'pending';
    const meta = EXECUTION_RESULT_META[exec] || EXECUTION_RESULT_META.pending;

    const card = document.createElement("div");
    card.className =
        "relative bg-white rounded-lg shadow p-4 flex flex-col justify-between hover:shadow-md transition";

    card.innerHTML = `
      <!-- Execution Result Indicator -->

        <div class="absolute top-3 right-3">
        <div class="custom-tooltip" data-tooltip="${meta.tooltip}">
        <i class="pulse pulse-dot ${meta.color}"></i>
        </div>
        </div>

      <div>
        <h2 class="text-lg font-semibold" style="padding-right: 1.6rem;">${d.title}</h2>
        <p class="text-sm text-gray-600">${d.company}</p>

        <p class="text-xs text-gray-500 mt-1">
          ${d.locations} • ${d.workModel} • ${d.employmentType}
        </p>

        <p class="text-xs text-gray-400 mt-1" data-publish-time="${row.publishTimeTs}">
          ${timeAgo(row.publishTimeTs)}
        </p>

        <p class="text-sm mt-3 line-clamp-3 text-gray-700">
          ${d.summary}
        </p>
      </div>

      <div class="mt-4 flex justify-between items-center gap-2 text-sm">

        <div class="flex gap-2">
          <button
            class="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            onclick='openModal(${JSON.stringify(d)})'
          >
            Open
          </button>
          <a
            href="${d.applyUrl}"
            target="_blank"
            class="apply-btn px-3 py-1 rounded border hover:bg-gray-100"
            onclick="event.stopPropagation()"
            data-job-id="${row.key}"
          >
            ${
                d.applicationStatus === 'applied' 
                ? `<span class="flex items-center gap-2"><i class="fas fa-check-circle text-green-500"></i>Applied</span>` 
                : 'Apply'
            }
          </a>


            <!-- Mark as Applied Button (only if not yet applied) -->
            ${
                d.applicationStatus !== 'applied' 
                ? `<button class="px-3 py-1 rounded bg-green-500 text-white hover:bg-green-600 mark-applied-btn" data-job-id="${row.key}">Mark as Applied</button>` 
                : ''
            }

        </div>


        
        ${
            d.applicationStatus !== 'applied' 
            ? `
            <div class="grid grid-cols-2 gap-4">
              <button class="text-gray-400 hover:text-gray-600 custom-tooltip not-interested-btn" data-job-id="${row.key}" data-tooltip="Not Interested">
                <i class="fa-solid fa-eye-slash"></i>
              </button>
              <button class="text-gray-500 hover:text-red-700" onclick="deleteJob('${row.key}')">
                <i class="fa-solid fa-trash mr-2"></i>
              </button>
            </div>
            ` 
            : `
            <div class="grid">
              <button class="text-gray-500 hover:text-red-700" onclick="deleteJob('${row.key}')">
                <i class="fa-solid fa-trash mr-2"></i>
              </button>
            </div>
            `
        }

      </div>
    `;

    jobsContainer.appendChild(card);
  });
}


/* ======================================================
   JOBS COUNT
====================================================== */
async function fetchJobsCount() {
  const countEl = document.getElementById("jobsCount");

  try {
    const res = await fetch(`${RPC_URL}/json_store_count`, {
      method: "POST",
      headers: {
        apikey: API_KEY,
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        _remote: filters.remote || null,
        _exclude_clearance: filters.excludeClearance || null,
        _exclude_citizen: filters.excludeCitizen || null,
        _visa: filters.visa || null,
        _hide_applied: filters.hideApplied || null,
        _show_applied: filters.showApplied || null,
        _search: filters.search || null
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch job count: ${res.status} ${text}`);
    }

    const data = await res.json();
    const count = data?.[0]?.count ?? 0;

    countEl.textContent = `Showing ${count} job${count !== 1 ? "s" : ""}`;
  } catch (err) {
    console.error("Error fetching job count:", err);
    countEl.textContent = "Failed to load job count";
  }
}


/* ======================================================
   PUBLISHED TIME DESCRIPTION
====================================================== */
function timeAgo(publishTimeTs) {
  if (!publishTimeTs) return "";

  const date = new Date(publishTimeTs); // already ISO / RFC3339
  const now = new Date();

  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

function refreshPublishTimes() {
  document.querySelectorAll("[data-publish-time]").forEach(el => {
    const ts = el.dataset.publishTime;
    el.textContent = timeAgo(ts);
  });
}

setInterval(refreshPublishTimes, 60_000);


/* ======================================================
   SALARY DESCRIPTION
====================================================== */
function formatSalaryRange(job) {
  try {
    const min = Number(job?.minSalary);
    const max = Number(job?.maxSalary);

    // No usable data
    if (!Number.isFinite(min) && !Number.isFinite(max)) {
      return "Not specified";
    }

    // Helper: 75000 -> 75K, 125000 -> 125K
    const formatShort = (n) => {
      if (!Number.isFinite(n)) return null;
      if (n >= 1000) return `${Math.round(n / 1000)}K`;
      return String(Math.round(n));
    };

    const minStr = formatShort(min);
    const maxStr = formatShort(max);

    // Decide pay type (heuristic)
    const sample = Math.max(
      Number.isFinite(min) ? min : 0,
      Number.isFinite(max) ? max : 0
    );

    let suffix = "";
    if (sample > 0) {
      if (sample <= 500) suffix = "/hr";
      else if (sample >= 10_000) suffix = "/yr";
    }

    // Build range text
    let range;
    if (minStr && maxStr) {
      range = minStr === maxStr ? minStr : `${minStr} - ${maxStr}`;
    } else {
      range = minStr || maxStr;
    }

    return suffix ? `${range}${suffix}` : range;
  } catch {
    return "Not specified";
  }
}





/* ======================================================
   MODAL
====================================================== */
function openModal(job) {
  const modal = document.getElementById("jobModal");
  const content = document.getElementById("modalContent");

  content.innerHTML = `
    <h2 class="text-xl font-bold">${job.title}</h2>
    <p class="text-gray-600">${job.company}</p>

    <div class="grid grid-cols-2 gap-3 mt-4 text-sm">
      <p><strong>Location:</strong> ${job.locations}</p>
      <p><strong>Work model:</strong> ${job.workModel}</p>
      <p><strong>Employment:</strong> ${job.employmentType}</p>
      <p><strong>Seniority:</strong> ${job.seniority}</p>
      <p><strong>Salary:</strong> ${formatSalaryRange(job)}</p>
      <p><strong>Match score:</strong> ${job?.matchScore}</p>
    </div>

    <p class="mt-4 text-gray-700">${job?.summary}</p>

    <div class="mt-4 flex gap-4 text-sm">
      <a href="${job?.companyURL}" target="_blank" class="text-blue-600 underline">
        Company
      </a>
      <a href="${job?.originalUrl}" target="_blank" class="text-blue-600 underline">
        Original post
      </a>
    </div>
  `;

    modal.classList.add("show");
}

function closeModal() {
  const modal = document.getElementById("jobModal");
//   modal.classList.add("hidden");
  modal.classList.remove("show");
}


/* ======================================================
   MARK AS APPLIED 
====================================================== */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".mark-applied-btn");
  if (!btn) return;
  e.stopPropagation(); // Prevent card click

  try {
    // PATCH the job by key
    const jobKey = btn.dataset.jobId;

    await fetch(`https://${PROJECT_ID}.supabase.co/rest/v1/rpc/update_json_field`, {
        method: "POST",
        headers: {
            apikey: API_KEY,
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            k: jobKey,
            new_data: { applicationStatus: 'applied' }
        })
    });


    // const updatedRows = await res.json();

    // if (!updatedRows.length) throw new Error("No row updated");

    // Update local data array
    const job = jobs.find(j => j.key === jobKey);
    console.log("FOUND JOB TO DEL:", job)
    if (job) job.data.applicationStatus = 'applied';

    // Find the card containing this button first
    let card = btn;
    while (card && !card.classList.contains("bg-white")) {
    card = card.parentElement;
    }

    if (!card) return;

    // Update Apply button inside the card
    const applyBtn = card.querySelector(`.apply-btn[data-job-id="${jobKey}"]`);
    if (applyBtn) {
    applyBtn.innerHTML = `<span class="flex items-center gap-2">
        <i class="fas fa-check-circle text-green-500"></i>Applied
    </span>`;
    }

    // Now remove the Mark as Applied button safely
    btn.remove();



  } catch (err) {
    console.error("Failed to mark applied:", err);
    alert("Failed to mark as applied. Try again.");
  }
});

/* ======================================================
   NOT INTERESTED (SOFT DELETE)
====================================================== */
// Temporary stack to hold "undoable" jobs
const undoNotifications = document.getElementById("undoNotifications");

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".not-interested-btn");
  if (!btn) return;

  const jobKey = btn.dataset.jobId;
  const jobIndex = jobs.findIndex(j => j.key === jobKey);
  if (jobIndex === -1) return;

  const job = jobs[jobIndex];

  // Remove from UI immediately
  jobs.splice(jobIndex, 1);
  renderJobs();
  fetchJobsCount();

  // ✅ Persist state change
  try {
    await fetch(`${RPC_URL}/upsert_job`, {
      method: "POST",
      headers: {
        apikey: API_KEY,
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        k: job.key,
        force_data: {
          applicationStatus: "not_interested"
        },
        soft_data: {}
      })
    });
  } catch (err) {
    console.error("Failed to mark Not Interested:", err);
  }

  // Undo toast
  createUndoToast(
    job,
    async () => {
      // Restore UI
      jobs.splice(jobIndex, 0, job);
      renderJobs();
      fetchJobsCount();

      // 🔁 Undo state
      try {
        await fetch(`${RPC_URL}/upsert_job`, {
          method: "POST",
          headers: {
            apikey: API_KEY,
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            k: job.key,
            force_data: {
              applicationStatus: "init"
            },
            soft_data: {}
          })
        });
      } catch (err) {
        console.error("Failed to undo Not Interested:", err);
      }
    },
    5000
  );
});


// Example toast/snackbar
function createUndoToast(job, undoCallback, timeout = 5000) {

  const toast = document.createElement("li");
  toast.className = "toast";
  
  // Set the CSS variable for animation duration
  toast.style.setProperty("--toast-duration", timeout + "ms");

  // Inner content
  toast.innerHTML = `
    <div class="toast-content">
      <span>Marked "${job.data.title}" as Not Interested</span>
      <button class="undo-btn">Undo</button>
    </div>
  `;

  // Append toast
  undoNotifications.appendChild(toast);

  // Undo button
  toast.querySelector(".undo-btn").addEventListener("click", () => {
    clearTimeout(toast.timeoutId);
    removeUndoToast(toast);
    if (undoCallback) undoCallback();
  });

  // Auto remove
  toast.timeoutId = setTimeout(() => removeUndoToast(toast), timeout);
}

function removeUndoToast(toast) {
	toast.classList.add("hide");
	setTimeout(() => {
		if (toast.parentElement) toast.parentElement.removeChild(toast);
	}, 300);
}


/* ======================================================
   DELETE (HARD DELETE)
====================================================== */
let jobKeyToDelete = null;

async function deleteJob(key) {
  jobKeyToDelete = key;
  const deleteModal = document.getElementById("deleteModal");
  deleteModal.classList.remove("hidden");
}

// Cancel button closes modal
document.getElementById("cancelDeleteBtn").addEventListener("click", () => {
  document.getElementById("deleteModal").classList.add("hidden");
  jobKeyToDelete = null;
});

// Confirm button deletes the job
document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
  if (!jobKeyToDelete) return;

  try {
    await fetch(`${BASE_URL}?key=eq.${jobKeyToDelete}`, {
        method: "DELETE",
        headers: {
            apikey: API_KEY,
            Authorization: `Bearer ${API_KEY}`
        }
    });

    jobs = jobs.filter(j => j.key !== jobKeyToDelete);
    renderJobs();
  } catch (err) {
    console.error("Failed to delete job:", err);
    alert("Failed to delete job. Try again.");
  } finally {
    document.getElementById("deleteModal").classList.add("hidden");
    jobKeyToDelete = null;
  }
});


/* ======================================================
   FILTER HANDLERS
====================================================== */
function resetAndReload() {
  jobs = [];
  page = 0;
  hasMore = true;
  fetchJobsCount();
  fetchJobs();
}

document.getElementById("searchInput").oninput = e => {
  filters.search = e.target.value.trim();
  resetAndReload();
};

document.getElementById("remoteFilter").onchange = e => {
  filters.remote = e.target.checked;
  resetAndReload();
};

document.getElementById("clearanceFilter").onchange = e => {
  filters.excludeClearance = e.target.checked;
  resetAndReload();
};

document.getElementById("citizenFilter").onchange = e => {
  filters.excludeCitizen = e.target.checked;
  resetAndReload();
};

document.getElementById("visaFilter").onchange = e => {
  filters.visa = e.target.checked;
  resetAndReload();
};

document.getElementById("hideAppliedFilter").onchange = e => {
  filters.hideApplied = e.target.checked;
  resetAndReload();
};

document.getElementById("showAppliedFilter").onchange = e => {
  filters.showApplied = e.target.checked;
  resetAndReload(); // your existing function to refresh rows
};


/* ======================================================
   INFINITE SCROLL
====================================================== */
window.addEventListener("scroll", () => {
  if (
    hasMore &&
    !loading &&
    window.innerHeight + window.scrollY >=
      document.body.offsetHeight - 300
  ) {
    fetchJobs();
  }
});

/* ======================================================
   RUN ALL
====================================================== */
async function initRunAllJobButton() {
    const btn = document.getElementById('runAllBtn');
    try {
        const res = await fetch(`${API_BASE}/job-status`);
        const data = await res.json();
        if (data.isRunnerActive) {
            btn.classList.add('active'); // show button as running
        } else {
            btn.classList.remove('active'); // show button as stopped
        }
    } catch (err) {
        console.error("Failed to fetch job status:", err);
    }
}

document.getElementById('runAllBtn').addEventListener('click', async () => {

    const btn = document.getElementById('runAllBtn');
    
    if (!btn.classList.contains('active')) {
        // Server Communication
        try {
            const payload = {
                fetchNewAndRunAll: true
            };
            const response = await fetch(`${API_BASE}/run-jobs`, { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const data = await response.json();
            console.log("RESPONSE::", data);
            if (data.success) {
                btn.classList.add('active'); // UI Update
                console.log('Job automation started successfully!');
            } else {
                console.log(`Failed to start automation. Response Error: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Error connecting to server.');
        }
    } else {
        try {
            const res = await fetch(`${API_BASE}/stop-run-jobs`, { method: 'POST' });
            if (res.ok) {
                btn.classList.remove('active');
            }
        } catch (err) {
            console.error(err);
            alert('Error connecting to server.');
        }
    }
});


/* ======================================================
   DELETE ALL
====================================================== */
const deleteAllBtn = document.querySelector("#delete-all .button");

async function deleteFilteredJobs(filters) {
  try {
    const params = new URLSearchParams();
    const orClauses = [];
    let hasFilter = false;

    // Boolean filters
    if (filters.remote) {
      params.append("data->>isRemote", "eq.true");
      hasFilter = true;
    }
    if (filters.excludeClearance) {
      params.append("data->>isClearanceRequired", "eq.false");
      hasFilter = true;
    }
    if (filters.excludeCitizen) {
      params.append("data->>isCitizenOnly", "eq.false");
      hasFilter = true;
    }
    if (filters.visa) {
      params.append("data->>isVisaSponsor", "eq.true");
      hasFilter = true;
    }

    // Applied filters
    if (filters.hideApplied) {
      orClauses.push(
        "data->>applicationStatus.is.null",
        "data->>applicationStatus.neq.applied"
      );
      hasFilter = true;
    }

    if (filters.showApplied) {
      params.append("data->>applicationStatus", "eq.applied");
      hasFilter = true;
    }

    // Search
    if (filters.search) {
      orClauses.push(
        `data->>title.ilike.*${filters.search}*`,
        `data->>company.ilike.*${filters.search}*`
      );
      hasFilter = true;
    }

    // Combine OR clauses
    if (orClauses.length) {
      params.append("or", `(${orClauses.join(",")})`);
    }

    // 🚨 Supabase requires WHERE clause for DELETE
    if (!hasFilter) {
      params.append("key", "neq.__delete_all__");
    }

    const url = `https://${PROJECT_ID}.supabase.co/rest/v1/json_store?${params.toString()}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: API_KEY,
        Authorization: `Bearer ${API_KEY}`,
        Prefer: "return=minimal"
      }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to delete jobs: ${res.status} ${text}`);
    }

    resetAndReload();
  } catch (err) {
    console.error("Error deleting jobs:", err);
    alert("Error deleting jobs: " + err.message);
  }
}

deleteAllBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    // Add animation
    if (!deleteAllBtn.classList.contains("delete")) {
        deleteAllBtn.classList.add("delete");
        setTimeout(() => deleteAllBtn.classList.remove("delete"), 2200);
    }
    deleteFilteredJobs(filters);
});


/* ======================================================
   SERVER LISTENER
====================================================== */
// Listen for server events
const eventSource = new EventSource(`${API_BASE}/job-status-stream`);

eventSource.onmessage = function(event) {
    console.log("Server Event:", event.data);

    if (event.data === "all_jobs_completed" || event.data === "jobs_stopped") {
        const btn = document.getElementById('runAllBtn');
        btn.classList.remove('active'); // Disable button visually
        console.log("All jobs completed, button reset!");
    }
};

eventSource.onerror = function(err) {
    console.error("EventSource failed:", err);
    // Stop retrying
    eventSource.close(); // server isn't available.
};


/* ======================================================
   INIT
====================================================== */
initRunAllJobButton();
fetchJobsCount();
fetchJobs();
