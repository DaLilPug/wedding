/* =========================================================
   Wedding site configuration  -  edit the values below.
   This is the ONLY file you need to touch to go live.
   ========================================================= */
window.WEDDING_CONFIG = {
  // Couple + date ----------------------------------------------------------
  coupleNames: "Austin & Anastasiia",

  // Ceremony date & time, ISO 8601 with timezone offset.
  // April in Chicago is CDT (-05:00). Change the time to your real ceremony start.
  weddingDateISO: "2027-04-23T16:00:00-05:00",

  // Supabase (leave blank to run in local demo mode) ----------------------
  // Project Settings -> API -> Project URL and "anon public" key.
  supabaseUrl: "https://ugweqscwfbxsdecgruqw.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnd2Vxc2N3ZmJ4c2RlY2dydXF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDcyNTksImV4cCI6MjA5Nzg4MzI1OX0.7WBJyPrDkiKgk4fvy49WBcV7Q9cRiDeBdIGDiR1zvyU",

  // RSVP options ----------------------------------------------------------
  // Add meal choices here to show a meal selector per attending guest.
  // Leave the array empty to skip the meal question entirely.
  mealOptions: [],   // e.g. ["Beef", "Chicken", "Vegetarian"]

  // Show a free-text "note for the couple" box on the RSVP form.
  askNote: true
};
