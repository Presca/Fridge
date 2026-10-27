// Public settings for the Fridge app. Nothing here is secret: the Worker URL is visible to anyone
// who opens the site anyway. The passcode is typed into the app's Settings and stays on each phone.
//
// Leave workerUrl empty to run Fridge fully offline on one phone (no AI, no sync).
window.FRIDGE_CONFIG = {
  workerUrl: '' // e.g. 'https://fridge-api.<your-subdomain>.workers.dev'
};
