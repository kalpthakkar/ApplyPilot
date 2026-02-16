const PLATFORM_TYPE = {
  ATS: 'ATS',
  JOB_BOARD: 'JOB_BOARD'
};

/**
 * 🌐 ATS/JobBoard pattern map
 * Defines which hostname regex patterns map to which ATS/JobBoard modules.
 * Each entry provides:
 *   - type: PLATFORM_TYPE
 *   - regex: pattern to match host
 *   - name:  standardized ATS platform name
 *   - modulePath:   absolute extension path to module file
 */
export const PLATFORM_REGISTRY = [
  // ================= ATS =================
  {
    type: PLATFORM_TYPE.ATS,
    name: 'Workday',
    regex: /\.myworkday(jobs|site)\.com$/i,
    modulePath: 'dist/modules/ats/workday.js'
  },
  {
    type: PLATFORM_TYPE.ATS,
    name: 'Greenhouse',
    regex: /greenhouse\.io$/i,
    modulePath: 'dist/modules/ats/greenhouse.js'
  },
  {
    type: PLATFORM_TYPE.ATS,
    name: 'Lever',
    regex: /(^|\.)lever\.co$/i,
    modulePath: 'dist/modules/ats/lever.js'
  },


  // ================= JOB BOARDS =================
  {
    type: PLATFORM_TYPE.JOB_BOARD,
    name: 'JobRights',
    regex: /jobrights?\.ai$/i,
    modulePath: 'dist/modules/jobBoards/jobrights.js'
  },
  {
    type: PLATFORM_TYPE.JOB_BOARD,
    name: 'HiringCafe',
    regex: /hiring\.cafe$/i,
    modulePath: 'dist/modules/jobBoards/hiringcafe.js'
  }

  // ➕ Add additional integrations here
];
