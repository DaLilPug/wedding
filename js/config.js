/* =========================================================
   Wedding site configuration  -  edit the values below.
   This is the ONLY file you need to touch to go live.
   ========================================================= */
window.WEDDING_CONFIG = {
  // Couple + date ----------------------------------------------------------
  coupleNames: "Austin & Anastasiia",

  // Ceremony date & time, ISO 8601 with timezone offset.
  // April is EDT (-04:00) on the US East Coast. Change the time/offset to match.
  weddingDateISO: "2027-04-23T16:00:00-04:00",

  // Supabase (leave blank to run in local demo mode) ----------------------
  // Project Settings -> API -> Project URL and "anon public" key.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // RSVP options ----------------------------------------------------------
  // Add meal choices here to show a meal selector per attending guest.
  // Leave the array empty to skip the meal question entirely.
  mealOptions: [],   // e.g. ["Beef", "Chicken", "Vegetarian"]

  // Show a free-text "note for the couple" box on the RSVP form.
  askNote: true
};
