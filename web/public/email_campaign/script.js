// ./public/script.js

/* ----------------------------------------------------------
* ------------------ 🔹 Pre-Initialization ------------------
* -----------------------------------------------------------
*/
const sections = document.querySelectorAll(".form-section");
const steps = document.querySelectorAll(".progress-step");
const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");
const form = document.getElementById("multiStepForm");


/* ------------------------------------------------------------
* ------------------ 🔹 Initialize Constants ------------------
* -------------------------------------------------------------
*/
// --- Country → State map ---
const countries = {
  	"United States of America": [ 
		"Alabama (AL)", "Alaska (AK)", "Arizona (AZ)", "Arkansas (AR)", "California (CA)", "Colorado (CO)", "Connecticut (CT)", "Delaware (DE)", "District of Columbia (DC)", "Florida (FL)", 
		"Georgia (GA)", "Hawaii (HI)", "Idaho (ID)", "Illinois (IL)", "Indiana (IN)", "Iowa (IA)", "Kansas (KS)", "Kentucky (KY)", "Louisiana (LA)", "Maine (ME)", 
		"Maryland (MD)", "Massachusetts (MA)", "Michigan (MI)", "Minnesota (MN)", "Mississippi (MS)", "Missouri (MO)", "Montana (MT)", "Nebraska (NE)", "Nevada (NV)", "New Hampshire (NH)", 
		"New Jersey (NJ)", "New Mexico (NM)", "New York (NY)", "North Carolina (NC)", "North Dakota (ND)", "Ohio (OH)", "Oklahoma (OK)", "Oregon (OR)", "Pennsylvania (PA)", "Rhode Island (RI)", 
		"South Carolina (SC)", "South Dakota (SD)", "Tennessee (TN)", "Texas (TX)", "Utah (UT)", "Vermont (VT)", "Virginia (VA)", "Washington (WA)", "West Virginia (WV)", "Wisconsin (WI)", 
		"Wyoming (WY)"
	],
	"India": [ 
		"Andhra Pradesh (AP)", "Arunachal Pradesh (AR)", "Assam (AS)", "Bihar (BR)", "Chhattisgarh (CG)", "Goa (GA)", "Gujarat (GJ)", "Haryana (HR)", "Himachal Pradesh (HP)", "Jharkhand (JH)", 
		"Karnataka (KA)", "Kerala (KL)", "Madhya Pradesh (MP)", "Maharashtra (MH)", "Manipur (MN)", "Meghalaya (ML)", "Mizoram (MZ)", "Nagaland (NL)", "Odisha (OD)", "Punjab (PB)", 
		"Rajasthan (RJ)", "Sikkim (SK)", "Tamil Nadu (TN)", "Telangana (TS)", "Tripura (TR)", "Uttar Pradesh (UP)", "Uttarakhand (UK)", "West Bengal (WB)"
	],
	"Canada": [
		"Alberta (AB)", "British Columbia (BC)", "Manitoba (MB)", "New Brunswick (NB)", "Newfoundland and Labrador (NL)", "Northwest Territories (NT)", "Nova Scotia (NS)", "Nunavut (NU)", "Ontario (ON)", "Prince Edward Island (PE)", 
		"Quebec (QC)", "Saskatchewan (SK)", "Yukon (YT)"
	]
};

const tzIdentifier = [
    "Africa/Abidjan",
    "Africa/Accra",
    "Africa/Addis_Ababa",
    "Africa/Algiers",
    "Africa/Asmara",
    "Africa/Asmera",
    "Africa/Bamako",
    "Africa/Bangui",
    "Africa/Banjul",
    "Africa/Bissau",
    "Africa/Blantyre",
    "Africa/Brazzaville",
    "Africa/Bujumbura",
    "Africa/Cairo",
    "Africa/Casablanca",
    "Africa/Ceuta",
    "Africa/Conakry",
    "Africa/Dakar",
    "Africa/Dar_es_Salaam",
    "Africa/Djibouti",
    "Africa/Douala",
    "Africa/El_Aaiun",
    "Africa/Freetown",
    "Africa/Gaborone",
    "Africa/Harare",
    "Africa/Johannesburg",
    "Africa/Juba",
    "Africa/Kampala",
    "Africa/Khartoum",
    "Africa/Kigali",
    "Africa/Kinshasa",
    "Africa/Lagos",
    "Africa/Libreville",
    "Africa/Lome",
    "Africa/Luanda",
    "Africa/Lubumbashi",
    "Africa/Lusaka",
    "Africa/Malabo",
    "Africa/Maputo",
    "Africa/Maseru",
    "Africa/Mbabane",
    "Africa/Mogadishu",
    "Africa/Monrovia",
    "Africa/Nairobi",
    "Africa/Ndjamena",
    "Africa/Niamey",
    "Africa/Nouakchott",
    "Africa/Ouagadougou",
    "Africa/Porto-Novo",
    "Africa/Sao_Tome",
    "Africa/Timbuktu",
    "Africa/Tripoli",
    "Africa/Tunis",
    "Africa/Windhoek",
    "America/Adak",
    "America/Anchorage",
    "America/Anguilla",
    "America/Antigua",
    "America/Araguaina",
    "America/Argentina/Buenos_Aires",
    "America/Argentina/Catamarca",
    "America/Argentina/ComodRivadavia",
    "America/Argentina/Cordoba",
    "America/Argentina/Jujuy",
    "America/Argentina/La_Rioja",
    "America/Argentina/Mendoza",
    "America/Argentina/Rio_Gallegos",
    "America/Argentina/Salta",
    "America/Argentina/San_Juan",
    "America/Argentina/San_Luis",
    "America/Argentina/Tucuman",
    "America/Argentina/Ushuaia",
    "America/Aruba",
    "America/Asuncion",
    "America/Atikokan",
    "America/Atka",
    "America/Bahia",
    "America/Bahia_Banderas",
    "America/Barbados",
    "America/Belem",
    "America/Belize",
    "America/Blanc-Sablon",
    "America/Boa_Vista",
    "America/Bogota",
    "America/Boise",
    "America/Buenos_Aires",
    "America/Cambridge_Bay",
    "America/Campo_Grande",
    "America/Cancun",
    "America/Caracas",
    "America/Catamarca",
    "America/Cayenne",
    "America/Cayman",
    "America/Chicago",
    "America/Chihuahua",
    "America/Ciudad_Juarez",
    "America/Coral_Harbour",
    "America/Cordoba",
    "America/Costa_Rica",
    "America/Coyhaique",
    "America/Creston",
    "America/Cuiaba",
    "America/Curacao",
    "America/Danmarkshavn",
    "America/Dawson",
    "America/Dawson_Creek",
    "America/Denver",
    "America/Detroit",
    "America/Dominica",
    "America/Edmonton",
    "America/Eirunepe",
    "America/El_Salvador",
    "America/Ensenada",
    "America/Fort_Nelson",
    "America/Fort_Wayne",
    "America/Fortaleza",
    "America/Glace_Bay",
    "America/Godthab",
    "America/Goose_Bay",
    "America/Grand_Turk",
    "America/Grenada",
    "America/Guadeloupe",
    "America/Guatemala",
    "America/Guayaquil",
    "America/Guyana",
    "America/Halifax",
    "America/Havana",
    "America/Hermosillo",
    "America/Indiana/Indianapolis",
    "America/Indiana/Knox",
    "America/Indiana/Marengo",
    "America/Indiana/Petersburg",
    "America/Indiana/Tell_City",
    "America/Indiana/Vevay",
    "America/Indiana/Vincennes",
    "America/Indiana/Winamac",
    "America/Indianapolis",
    "America/Inuvik",
    "America/Iqaluit",
    "America/Jamaica",
    "America/Jujuy",
    "America/Juneau",
    "America/Kentucky/Louisville",
    "America/Kentucky/Monticello",
    "America/Knox_IN",
    "America/Kralendijk",
    "America/La_Paz",
    "America/Lima",
    "America/Los_Angeles",
    "America/Louisville",
    "America/Lower_Princes",
    "America/Maceio",
    "America/Managua",
    "America/Manaus",
    "America/Marigot",
    "America/Martinique",
    "America/Matamoros",
    "America/Mazatlan",
    "America/Mendoza",
    "America/Menominee",
    "America/Merida",
    "America/Metlakatla",
    "America/Mexico_City",
    "America/Miquelon",
    "America/Moncton",
    "America/Monterrey",
    "America/Montevideo",
    "America/Montreal",
    "America/Montserrat",
    "America/Nassau",
    "America/New_York",
    "America/Nipigon",
    "America/Nome",
    "America/Noronha",
    "America/North_Dakota/Beulah",
    "America/North_Dakota/Center",
    "America/North_Dakota/New_Salem",
    "America/Nuuk",
    "America/Ojinaga",
    "America/Panama",
    "America/Pangnirtung",
    "America/Paramaribo",
    "America/Phoenix",
    "America/Port-au-Prince",
    "America/Port_of_Spain",
    "America/Porto_Acre",
    "America/Porto_Velho",
    "America/Puerto_Rico",
    "America/Punta_Arenas",
    "America/Rainy_River",
    "America/Rankin_Inlet",
    "America/Recife",
    "America/Regina",
    "America/Resolute",
    "America/Rio_Branco",
    "America/Rosario",
    "America/Santa_Isabel",
    "America/Santarem",
    "America/Santiago",
    "America/Santo_Domingo",
    "America/Sao_Paulo",
    "America/Scoresbysund",
    "America/Shiprock",
    "America/Sitka",
    "America/St_Barthelemy",
    "America/St_Johns",
    "America/St_Kitts",
    "America/St_Lucia",
    "America/St_Thomas",
    "America/St_Vincent",
    "America/Swift_Current",
    "America/Tegucigalpa",
    "America/Thule",
    "America/Thunder_Bay",
    "America/Tijuana",
    "America/Toronto",
    "America/Tortola",
    "America/Vancouver",
    "America/Virgin",
    "America/Whitehorse",
    "America/Winnipeg",
    "America/Yakutat",
    "America/Yellowknife",
    "Antarctica/Casey",
    "Antarctica/Davis",
    "Antarctica/DumontDUrville",
    "Antarctica/Macquarie",
    "Antarctica/Mawson",
    "Antarctica/McMurdo",
    "Antarctica/Palmer",
    "Antarctica/Rothera",
    "Antarctica/South_Pole",
    "Antarctica/Syowa",
    "Antarctica/Troll",
    "Antarctica/Vostok",
    "Arctic/Longyearbyen",
    "Asia/Aden",
    "Asia/Almaty",
    "Asia/Amman",
    "Asia/Anadyr",
    "Asia/Aqtau",
    "Asia/Aqtobe",
    "Asia/Ashgabat",
    "Asia/Ashkhabad",
    "Asia/Atyrau",
    "Asia/Baghdad",
    "Asia/Bahrain",
    "Asia/Baku",
    "Asia/Bangkok",
    "Asia/Barnaul",
    "Asia/Beirut",
    "Asia/Bishkek",
    "Asia/Brunei",
    "Asia/Calcutta",
    "Asia/Chita",
    "Asia/Choibalsan",
    "Asia/Chongqing",
    "Asia/Chungking",
    "Asia/Colombo",
    "Asia/Dacca",
    "Asia/Damascus",
    "Asia/Dhaka",
    "Asia/Dili",
    "Asia/Dubai",
    "Asia/Dushanbe",
    "Asia/Famagusta",
    "Asia/Gaza",
    "Asia/Harbin",
    "Asia/Hebron",
    "Asia/Ho_Chi_Minh",
    "Asia/Hong_Kong",
    "Asia/Hovd",
    "Asia/Irkutsk",
    "Asia/Istanbul",
    "Asia/Jakarta",
    "Asia/Jayapura",
    "Asia/Jerusalem",
    "Asia/Kabul",
    "Asia/Kamchatka",
    "Asia/Karachi",
    "Asia/Kashgar",
    "Asia/Kathmandu",
    "Asia/Katmandu",
    "Asia/Khandyga",
    "Asia/Kolkata",
    "Asia/Krasnoyarsk",
    "Asia/Kuala_Lumpur",
    "Asia/Kuching",
    "Asia/Kuwait",
    "Asia/Macao",
    "Asia/Macau",
    "Asia/Magadan",
    "Asia/Makassar",
    "Asia/Manila",
    "Asia/Muscat",
    "Asia/Nicosia",
    "Asia/Novokuznetsk",
    "Asia/Novosibirsk",
    "Asia/Omsk",
    "Asia/Oral",
    "Asia/Phnom_Penh",
    "Asia/Pontianak",
    "Asia/Pyongyang",
    "Asia/Qatar",
    "Asia/Qostanay",
    "Asia/Qyzylorda",
    "Asia/Rangoon",
    "Asia/Riyadh",
    "Asia/Saigon",
    "Asia/Sakhalin",
    "Asia/Samarkand",
    "Asia/Seoul",
    "Asia/Shanghai",
    "Asia/Singapore",
    "Asia/Srednekolymsk",
    "Asia/Taipei",
    "Asia/Tashkent",
    "Asia/Tbilisi",
    "Asia/Tehran",
    "Asia/Tel_Aviv",
    "Asia/Thimbu",
    "Asia/Thimphu",
    "Asia/Tokyo",
    "Asia/Tomsk",
    "Asia/Ujung_Pandang",
    "Asia/Ulaanbaatar",
    "Asia/Ulan_Bator",
    "Asia/Urumqi",
    "Asia/Ust-Nera",
    "Asia/Vientiane",
    "Asia/Vladivostok",
    "Asia/Yakutsk",
    "Asia/Yangon",
    "Asia/Yekaterinburg",
    "Asia/Yerevan",
    "Atlantic/Azores",
    "Atlantic/Bermuda",
    "Atlantic/Canary",
    "Atlantic/Cape_Verde",
    "Atlantic/Faeroe",
    "Atlantic/Faroe",
    "Atlantic/Jan_Mayen",
    "Atlantic/Madeira",
    "Atlantic/Reykjavik",
    "Atlantic/South_Georgia",
    "Atlantic/St_Helena",
    "Atlantic/Stanley",
    "Australia/ACT",
    "Australia/Adelaide",
    "Australia/Brisbane",
    "Australia/Broken_Hill",
    "Australia/Canberra",
    "Australia/Currie",
    "Australia/Darwin",
    "Australia/Eucla",
    "Australia/Hobart",
    "Australia/LHI",
    "Australia/Lindeman",
    "Australia/Lord_Howe",
    "Australia/Melbourne",
    "Australia/North",
    "Australia/NSW",
    "Australia/Perth",
    "Australia/Queensland",
    "Australia/South",
    "Australia/Sydney",
    "Australia/Tasmania",
    "Australia/Victoria",
    "Australia/West",
    "Australia/Yancowinna",
    "Brazil/Acre",
    "Brazil/DeNoronha",
    "Brazil/East",
    "Brazil/West",
    "Canada/Atlantic",
    "Canada/Central",
    "Canada/Eastern",
    "Canada/Mountain",
    "Canada/Newfoundland",
    "Canada/Pacific",
    "Canada/Saskatchewan",
    "Canada/Yukon",
    "CET",
    "Chile/Continental",
    "Chile/EasterIsland",
    "CST6CDT",
    "Cuba",
    "EET",
    "Egypt",
    "Eire",
    "EST",
    "EST5EDT",
    "Etc/GMT",
    "Etc/GMT+0",
    "Etc/GMT+1",
    "Etc/GMT+10",
    "Etc/GMT+11",
    "Etc/GMT+12",
    "Etc/GMT+2",
    "Etc/GMT+3",
    "Etc/GMT+4",
    "Etc/GMT+5",
    "Etc/GMT+6",
    "Etc/GMT+7",
    "Etc/GMT+8",
    "Etc/GMT+9",
    "Etc/GMT-0",
    "Etc/GMT-1",
    "Etc/GMT-10",
    "Etc/GMT-11",
    "Etc/GMT-12",
    "Etc/GMT-13",
    "Etc/GMT-14",
    "Etc/GMT-2",
    "Etc/GMT-3",
    "Etc/GMT-4",
    "Etc/GMT-5",
    "Etc/GMT-6",
    "Etc/GMT-7",
    "Etc/GMT-8",
    "Etc/GMT-9",
    "Etc/GMT0",
    "Etc/Greenwich",
    "Etc/UCT",
    "Etc/Universal",
    "Etc/UTC",
    "Etc/Zulu",
    "Europe/Amsterdam",
    "Europe/Andorra",
    "Europe/Astrakhan",
    "Europe/Athens",
    "Europe/Belfast",
    "Europe/Belgrade",
    "Europe/Berlin",
    "Europe/Bratislava",
    "Europe/Brussels",
    "Europe/Bucharest",
    "Europe/Budapest",
    "Europe/Busingen",
    "Europe/Chisinau",
    "Europe/Copenhagen",
    "Europe/Dublin",
    "Europe/Gibraltar",
    "Europe/Guernsey",
    "Europe/Helsinki",
    "Europe/Isle_of_Man",
    "Europe/Istanbul",
    "Europe/Jersey",
    "Europe/Kaliningrad",
    "Europe/Kiev",
    "Europe/Kirov",
    "Europe/Kyiv",
    "Europe/Lisbon",
    "Europe/Ljubljana",
    "Europe/London",
    "Europe/Luxembourg",
    "Europe/Madrid",
    "Europe/Malta",
    "Europe/Mariehamn",
    "Europe/Minsk",
    "Europe/Monaco",
    "Europe/Moscow",
    "Europe/Nicosia",
    "Europe/Oslo",
    "Europe/Paris",
    "Europe/Podgorica",
    "Europe/Prague",
    "Europe/Riga",
    "Europe/Rome",
    "Europe/Samara",
    "Europe/San_Marino",
    "Europe/Sarajevo",
    "Europe/Saratov",
    "Europe/Simferopol",
    "Europe/Skopje",
    "Europe/Sofia",
    "Europe/Stockholm",
    "Europe/Tallinn",
    "Europe/Tirane",
    "Europe/Tiraspol",
    "Europe/Ulyanovsk",
    "Europe/Uzhgorod",
    "Europe/Vaduz",
    "Europe/Vatican",
    "Europe/Vienna",
    "Europe/Vilnius",
    "Europe/Volgograd",
    "Europe/Warsaw",
    "Europe/Zagreb",
    "Europe/Zaporozhye",
    "Europe/Zurich",
    "Factory",
    "GB",
    "GB-Eire",
    "GMT",
    "GMT+0",
    "GMT-0",
    "GMT0",
    "Greenwich",
    "Hongkong",
    "HST",
    "Iceland",
    "Indian/Antananarivo",
    "Indian/Chagos",
    "Indian/Christmas",
    "Indian/Cocos",
    "Indian/Comoro",
    "Indian/Kerguelen",
    "Indian/Mahe",
    "Indian/Maldives",
    "Indian/Mauritius",
    "Indian/Mayotte",
    "Indian/Reunion",
    "Iran",
    "Israel",
    "Jamaica",
    "Japan",
    "Kwajalein",
    "Libya",
    "MET",
    "Mexico/BajaNorte",
    "Mexico/BajaSur",
    "Mexico/General",
    "MST",
    "MST7MDT",
    "Navajo",
    "NZ",
    "NZ-CHAT",
    "Pacific/Apia",
    "Pacific/Auckland",
    "Pacific/Bougainville",
    "Pacific/Chatham",
    "Pacific/Chuuk",
    "Pacific/Easter",
    "Pacific/Efate",
    "Pacific/Enderbury",
    "Pacific/Fakaofo",
    "Pacific/Fiji",
    "Pacific/Funafuti",
    "Pacific/Galapagos",
    "Pacific/Gambier",
    "Pacific/Guadalcanal",
    "Pacific/Guam",
    "Pacific/Honolulu",
    "Pacific/Johnston",
    "Pacific/Kanton",
    "Pacific/Kiritimati",
    "Pacific/Kosrae",
    "Pacific/Kwajalein",
    "Pacific/Majuro",
    "Pacific/Marquesas",
    "Pacific/Midway",
    "Pacific/Nauru",
    "Pacific/Niue",
    "Pacific/Norfolk",
    "Pacific/Noumea",
    "Pacific/Pago_Pago",
    "Pacific/Palau",
    "Pacific/Pitcairn",
    "Pacific/Pohnpei",
    "Pacific/Ponape",
    "Pacific/Port_Moresby",
    "Pacific/Rarotonga",
    "Pacific/Saipan",
    "Pacific/Samoa",
    "Pacific/Tahiti",
    "Pacific/Tarawa",
    "Pacific/Tongatapu",
    "Pacific/Truk",
    "Pacific/Wake",
    "Pacific/Wallis",
    "Pacific/Yap",
    "Poland",
    "Portugal",
    "PRC",
    "PST8PDT",
    "ROC",
    "ROK",
    "Singapore",
    "Turkey",
    "UCT",
    "Universal",
    "US/Alaska",
    "US/Aleutian",
    "US/Arizona",
    "US/Central",
    "US/East-Indiana",
    "US/Eastern",
    "US/Hawaii",
    "US/Indiana-Starke",
    "US/Michigan",
    "US/Mountain",
    "US/Pacific",
    "US/Samoa",
    "UTC",
    "W-SU",
    "WET",
    "Zulu",
]


const el = (sel) => document.querySelector(sel);
const els = (sel) => [...document.querySelectorAll(sel)]; // returns array (not NodeList)


/* ======================================================
   Display Error
====================================================== */
// Temporary stack to hold errors
const progressErrorNotifications = document.getElementById("progressErrorNotifications");

// Example toast/snackbar
function createProgressErrorToast(msg, timeout = 3600) {

  const toast = document.createElement("li");
  toast.className = "toast";
  
  // Set the CSS variable for animation duration
  toast.style.setProperty("--toast-duration", timeout + "ms");

  // Inner content
  toast.innerHTML = `
    <div class="toast-content w-full">
      <span>${msg}</span>
      <button class="undo-btn">
	 <svg width="20" height="20" viewbox="0 0 40 40"><path d="M 10,10 L 30,30 M 30,10 L 10,30" stroke="black" stroke-width="4"/></svg> 
	  </button>
    </div>
  `;

  // Append toast
  progressErrorNotifications.appendChild(toast);

  // Undo button
  toast.querySelector(".undo-btn").addEventListener("click", () => {
    clearTimeout(toast.timeoutId);
    removeProgressErrorToast(toast);
  });

  // Auto remove
  toast.timeoutId = setTimeout(() => removeProgressErrorToast(toast), timeout);
}

function removeProgressErrorToast(toast) {
	toast.classList.add("hide");
	setTimeout(() => {
		if (toast.parentElement) toast.parentElement.removeChild(toast);
	}, 300);
}


/* ------------------------------------------------------------
* --------------- 🔹 Section Transition Control ---------------
* ------------------------------------------------------------- */
let current = 0;

function showSection(index) {

    // Show the section corresponding to index
    sections.forEach((s, i) => s.classList.toggle("active", i === index));

    // Highlight current step
    steps.forEach((step, i) => step.classList.toggle("active", i === index));

    // Enable/disable buttons
    prevBtn.disabled = index === 0;
    nextBtn.textContent = index === sections.length - 1 ? "Submit" : "Next";

    // Update current index
    current = index;
}

function validateProgress(current) {

	const section = current + 1;

	switch (section) {

		case 1: {
			if ( !(el(`#companyName`)?.value || el(`#linkedinPostURL`)?.value) ) {
				createProgressErrorToast("Please enter at least one value.");
				return false;
			}
			return true;
		}

		case 6: {
			if ( !document.querySelector('input[name="emailCompanyRepresentatives"]:checked') ) {
				createProgressErrorToast("Please select for 'Email Company Representatives'");
				return false;
			}
			return true;
		}

		case 7: {
			let hasError = false
			if ( !document.querySelector('input[name="followupsCount"]:checked') ) {
				createProgressErrorToast("Please select for 'FollowUps Count'");
				hasError = true;
			}
			if ( document.querySelectorAll('#zone .chips-container span').length == 0 ) {
				createProgressErrorToast("Please select for 'Zone'");
				hasError = true;
			}
			if ( !document.querySelector('input[name="days"]:checked') ) {
				createProgressErrorToast("Please select for 'Days'");
				hasError = true;
			}
			if ( !document.querySelector('#startTime').value || !document.querySelector('#endTime').value ) {
				createProgressErrorToast("Please select valid 'Time'");
				hasError = true;
			}

			return (hasError) ? false : true;
		}


		// document.querySelector(`input[name="emailCompanyRepresentatives"][value="true"]`).checked

		default: {
			return true;
		}
	}

	return true;
	
}


// Step-by-step buttons
nextBtn.addEventListener("click", () => {

	const shouldProgress = validateProgress(current);
	if (!shouldProgress) return;

    if (current < sections.length - 1) {
        showSection(current + 1);
    } else {
        nextBtn.classList.add("loading"); // Start loading animation on Submit click
        form.dispatchEvent(new Event("submit")); // Let app.js handle JSON submission
    }
});

prevBtn.addEventListener("click", () => {
    if (current > 0) showSection(current - 1);
});

// Clicking on a progress step jumps to that section
steps.forEach((step, i) => {
    step.addEventListener("click", () => {
        showSection(i);
        // Optional: scroll to top of form
        // form.scrollIntoView({ behavior: "smooth" });
    });
});

// Initialize
showSection(current);


/* ------------------------------------------------------------
* ----------------------- 🔹 Day / Time -----------------------
* -------------------------------------------------------------
*/

// Select the UL inside the multi-select
const timezoneUl = document.querySelector('#zone [data-options-list]');
// Clear existing items (optional)
timezoneUl.innerHTML = "";
// Populate dynamically
for (const tz of tzIdentifier) {
    const li = document.createElement('li');
    li.className = "px-3 py-2 cursor-pointer hover:bg-blue-100";
    li.setAttribute('data-value', tz);
    li.textContent = tz;
    timezoneUl.appendChild(li);
}
// Grab the radio buttons and time inputs
const timeRangeAllDayRadio = document.getElementById('timeRange-allDay');
const timeRangeCustomRadio = document.getElementById('timeRange-custom');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
// Function to set All Day values
function setAllDayTimes() {
  startTimeInput.value = '00:00';
  endTimeInput.value = '23:59';
  startTimeInput.disabled = true; // optionally disable editing
  endTimeInput.disabled = true;
}
// Function to enable custom time editing
function enableCustomTimes() {
  startTimeInput.disabled = false;
  endTimeInput.disabled = false;
  startTimeInput.value = '';
  endTimeInput.value = '';
}
// Event listeners
timeRangeAllDayRadio.addEventListener('change', () => {
  if (timeRangeAllDayRadio.checked) setAllDayTimes();
});
timeRangeCustomRadio.addEventListener('change', () => {
  if (timeRangeCustomRadio.checked) enableCustomTimes();
});


/* ------------------------------------------------------------
* ---------------- 🔹 Input Type Multi-select ----------------
* -------------------------------------------------------------
*/

/* -------------------------------------------------------------
* ----------- Input Type Multi-select 🔹 Chip Logic -----------
* --------------------------------------------------------------
*/
// Create a chip element for a given wrapper (no synthetic event required)
function createChipForWrapper(wrapper, value) {
  if (!value || !wrapper) return;
  const input = wrapper.querySelector('input');
  let chipsContainer = wrapper.querySelector('.chips-container');
  if (!chipsContainer) {
    chipsContainer = document.createElement('div');
    chipsContainer.className = 'chips-container flex flex-wrap gap-2 mb-1';
    input.parentNode.insertBefore(chipsContainer, input);
  }

  // Avoid duplicates
  if ([...chipsContainer.children].some(c => c.dataset.value === value)) return;

  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.dataset.value = value;
  chip.innerHTML = `${value}`;
  chip.addEventListener('click', () => chip.remove());
  chipsContainer.appendChild(chip);

  // clear input after adding chip
  if (input) input.value = '';
}

/* -------------------------------------------------------------
* -------- Input Type Multi-select 🔹 Options Dependent --------
* --------------------------------------------------------------
*/
document.querySelectorAll('[data-multiselect-options]').forEach(container => {
	const inputWrapper = container.querySelector('.multiselect-wrapper') || container;
	const input = inputWrapper.querySelector('input');
	
	// Ensure chips container exists
	let chipsContainer = inputWrapper.querySelector('.chips-container');
	if (!chipsContainer) {
		chipsContainer = document.createElement('div');
		chipsContainer.className = 'chips-container flex flex-wrap gap-2 mb-1';
		inputWrapper.insertBefore(chipsContainer, input);
	}
	
	const optionsList = inputWrapper.querySelector('[data-options-list]');
	const allOptions = [...optionsList.querySelectorAll('li')];
	
	// Update dropdown position dynamically
	const updateDropdownPosition = () => {
		optionsList.style.top = `${input.offsetTop + input.offsetHeight}px`;
		optionsList.style.left = `${input.offsetLeft}px`;
		optionsList.style.width = `${input.offsetWidth}px`;
	};
	
	// Show dropdown
	const showDropdown = () => {
		optionsList.classList.remove('hidden');
		updateDropdownPosition();
	};
	
	// Hide dropdown
	const hideDropdown = () => {
		optionsList.classList.add('hidden');
	};
	
	// Filter options based on input and selected chips
	const refreshOptions = () => {
		const inputVal = input.value.toLowerCase();
		const selectedValues = [...chipsContainer.children].map(c => c.dataset.value);
		allOptions.forEach(li => {
		const val = li.dataset.value;
		if (selectedValues.includes(val)) {
			li.style.display = 'none';
		} else {
			li.style.display = val.toLowerCase().includes(inputVal) ? 'block' : 'none';
		}
		});
	};
	
	input.addEventListener('focus', showDropdown);
	input.addEventListener('input', refreshOptions);
	
	// Handle selection
	optionsList.addEventListener('mousedown', e => {
		if (e.target.tagName === 'LI') {
		e.preventDefault();
		const value = e.target.dataset.value;
	
		// Create chip
		const chip = document.createElement('span');
		chip.className = 'chip';
		chip.dataset.value = value;
		chip.innerHTML = `${value}`;
		chip.onclick = () => {
			chip.remove();
			refreshOptions(); // Re-show removed option in dropdown
		};
		chipsContainer.appendChild(chip);
	
		input.value = '';
		refreshOptions();
		hideDropdown(); // Close after selection
		}
	});
	
	// Hide dropdown on blur
	input.addEventListener('blur', () => setTimeout(hideDropdown, 150));
	
	// Initial options refresh
	refreshOptions();
});

/* -------------------------------------------------------------
* ------- Input Type Multi-select 🔹 Options Independent -------
* --------------------------------------------------------------
*/
function initializeFreeMultiselect({ scope = document, maxChips = Infinity, onMaxReached } = {}) {

	// 🔔 Default hint behavior if maxChips is set but no custom handler is provided
    if (Number.isFinite(maxChips) && typeof onMaxReached !== "function") {
        onMaxReached = (wrapper, max) => {
            let hint = wrapper.querySelector('.chip-limit-hint');
            if (!hint) {
                hint = document.createElement('div');
                hint.className = 'chip-limit-hint text-xs text-red-500 mt-1';
                wrapper.appendChild(hint);
            }
            hint.textContent = `Maximum ${max} items allowed`;
            setTimeout(() => hint.remove(), 2000);
        };
    }

	// Safe no-op fallback
    if (typeof onMaxReached !== "function") {
        onMaxReached = () => {};
    }

    scope.querySelectorAll('[data-component="free-multiselect"]').forEach(container => {
        const inputWrapper = container.querySelector('.multiselect-wrapper') || container;
        const input = inputWrapper.querySelector('input');
        if (!input) return;

        let chipsContainer = inputWrapper.querySelector('.chips-container');
        if (!chipsContainer) {
            chipsContainer = document.createElement('div');
            chipsContainer.className = 'chips-container flex flex-wrap gap-2 mb-1';
            inputWrapper.insertBefore(chipsContainer, input);
        }

        // Prevent duplicate initialization
        if (input.dataset.initialized === 'true') return;
        input.dataset.initialized = 'true';

        input.addEventListener('keydown', e => {

            if (e.key !== 'Enter') return;
            const value = input.value.trim();
            if (!value) return;
			
            e.preventDefault();

            // 🔒 Max chip cap check
            if (chipsContainer.children.length >= maxChips) {
                onMaxReached(inputWrapper, maxChips);
                return;
            }

            // Prevent duplicates
            if ([...chipsContainer.children].some(c => c.dataset.value === value)) {
                input.value = '';
                return;
            }

            createChipForWrapper(inputWrapper, value);
            input.value = '';
        });
    });
}

/* -------------------------------------------------------------
* ------------- Input Type Range 🔹 One Way Slider -------------
* --------------------------------------------------------------
*/
function initOneWaySliders() {
    // Find all elements with the class `one-way-range` in the DOM
    const sliders = document.querySelectorAll('.one-way-range');

    sliders.forEach(slider => {
        const leftThumb = slider.querySelector(".thumb.left");
        const range = slider.querySelector(".range");
        const track = slider.querySelector(".track");

        const MIN = 1; // default min value (customize as needed)
        const MAX = 10; // default max value (customize as needed)

        let leftValue = MIN;

        // Convert value to percentage for positioning
        function valueToPercent(val) {
            return ((val - MIN) / (MAX - MIN)) * 100;
        }

        // Update the UI when value changes
        function updateUI() {
            const leftPct = valueToPercent(leftValue);

            // Position the thumb based on the percentage
            leftThumb.style.left = `${leftPct}%`;

            // Update the range (the line between the thumb and the right boundary)
            range.style.left = `${0}%`; // Range always starts from left
            range.style.width = `${leftPct}%`; // Range width is based on the thumb's position

            // Update tooltip dynamically
            leftThumb.setAttribute("data-tooltip", leftValue);
        }

        // Start dragging function
        function startDrag(e) {
            e.preventDefault();

            const onMove = (ev) => {
                const rect = track.getBoundingClientRect();
                const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width);
                const value = Math.round(MIN + (x / rect.width) * (MAX - MIN));

                // Set left thumb value (value can be between MIN and MAX)
                leftValue = Math.min(value, MAX); // Ensure leftValue never exceeds MAX

                updateUI();
            };

            const stopDrag = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", stopDrag);
            };

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", stopDrag);
        }

        // Add mouse down event for the left thumb
        leftThumb.addEventListener("mousedown", startDrag);

        // Init slider
        updateUI();

        // Optional: Expose current value externally
        slider.getValue = () => ({ min: leftValue });
    });
}



/* ------------------------------------------------------------
* ------------- 🔹 Helper → Prefill Input Values -------------
* -------------------------------------------------------------
*/
function setFieldValue(el, value) {
  if (!el) return;
  if (el.type === "checkbox") el.checked = !!value;
  else if (el.tagName === "SELECT") el.value = value || "";
  else if (el.type === "file") return; // skip file population
  else el.value = value ?? "";
}
// Helper → Prefill Chips
const populateChips = (parent, nameOfInput, values) => {
	const wrapper = parent.querySelector(`[name='${nameOfInput}']`)?.closest(".multiselect-wrapper");
	const chipsContainer = wrapper?.querySelector(".chips-container");
	if (!chipsContainer) return;

	chipsContainer.innerHTML = ""; // clear existing
	(values || []).forEach(val => {
		const chip = document.createElement("span");
		chip.className = "chip";
		chip.dataset.value = val;
		chip.innerHTML = `${val}`;
		chipsContainer.appendChild(chip);
		// Remove chip on click
		chip.addEventListener('click', () => chip.remove());
	});
};

function generateBlockId() {
  return crypto.randomUUID();
}

/* -------------------------------------------------------------------------------------------------
* --------------------------- 🔹 Dynamic • Add / Remove Sections [START] ---------------------------
* --------------------------------------------------------------------------------------------------
*/

// pass


/* -------------------------------------------------------------------------------------------------
* ---------------------------------------- 🔹 Populate Form ----------------------------------------
* --------------------------------- Exported Data(data) for app.js ---------------------------------
* --------------------------------------------------------------------------------------------------
*/
const additionalLeadIdentifiersContainer = document.getElementById("additionalLeadIdentifiersContainer");
const representativeTitlesContainer = document.getElementById("representativeTitlesContainer");
initializeFreeMultiselect({scope: additionalLeadIdentifiersContainer, maxChips: 50})
initializeFreeMultiselect({scope: representativeTitlesContainer, maxChips: 50})


// 🔹 Populate Form from JSON
window.populateData = function() {

	/**
	 * Populate radio/checkbox fields from database
	 * @param {Object} data - database object containing additionalInfo
	 * @param {string[]} fields - list of field names to populate
	 */
	function populateRadioOrCheckboxFieldsFromDB(data, nameAttributeValues) {

		nameAttributeValues.forEach(nameAttributeValue => {
			const dbValue = data[nameAttributeValue];

			if (dbValue === undefined || dbValue === null) return;

			// Convert boolean to string for matching value attributes in HTML
			const valueToMatch = typeof dbValue === 'boolean' ? String(dbValue) : dbValue;

			// Find the radio/checkbox input with matching value
			const input = document.querySelector(`input[name="${nameAttributeValue}"][value="${valueToMatch}"]`);
			
			if (input) input.checked = true;
		});
	}

	document.querySelector(`input[name="appendHistoricalLeads"][value="true"]`).checked = true
	// document.querySelector(`input[name="emailCompanyRepresentatives"][value="true"]`).checked = true
	populateChips(representativeTitlesContainer, "representativeTitles[]", ['CEO', 'Recruiter', 'Hiring Manager']);
	document.querySelector(`input[name="additionalLeadsCount"]`).value = '5';
	document.querySelector(`input[name="uniqueLeadsOnly"][value="false"]`).checked = true

	document.querySelector(`input[name="sendPersonalizedEmail"][value="false"]`).checked = true
	initOneWaySliders();
	document.querySelector(`input[name="followupsPaddingMode"][value="auto"]`).checked = true

	timeRangeAllDayRadio.click();
};

/* --------------------------------------------------------------------------------------------------
* ------------------------------------ 🔹 Adjust UI After Submit ------------------------------------
* ----------------------------------------------------------------------------------------------------
*/
// 🔹 Adjust UI After Submit
window.updateUIAfterSubmit = function(response) {

	// ---- Animation handling ----
	const submitBtn = document.getElementById("nextBtn");
	const successIcon = document.querySelector(".done");
	const failIcon = document.querySelector(".failed");

	// Stop spinner
	submitBtn.classList.add("hide-loading");

	// Show icon based on response

	const targetIcon = response.success ? successIcon : failIcon;
	targetIcon.classList.add("finish");

	// Reset after animation
	setTimeout(() => {
		submitBtn.classList.remove("loading", "hide-loading");
		successIcon.classList.remove("finish");
		failIcon.classList.remove("finish");
	}, 1200);
}