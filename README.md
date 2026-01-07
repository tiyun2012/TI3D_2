diff --git a/README.md b/README.md
index 4e02ee2b513e58c2005d73ed79bb780b3c08cfb8..5cd10b0784ae8b53550b3969f44322570973dfa0 100644
--- a/README.md
+++ b/README.md
@@ -1,20 +1,22 @@
 <div align="center">
 <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
 </div>
 
 # Run and deploy your AI Studio app
 
 This contains everything you need to run your app locally.
 
 View your app in AI Studio: https://ai.studio/apps/drive/1R_AQ66zRRBOWE85hDwA_QoNoqCgfu0ym
 
-## Run Locally
-
-**Prerequisites:**  Node.js
-
-
-1. Install dependencies:
-   `npm install`
-2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
-3. Run the app:
-   `npm run dev`
+## Run Locally
+
+**Prerequisites:**  Node.js
+
+
+1. Install dependencies:
+   `npm install`
+2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
+3. Start the dev server:
+   `npm run dev`
+4. View the app:
+   Open the printed URL (defaults to http://localhost:5173) in your browser. If you're running inside a container/VM, pass `--host --port 4173` to the dev command and visit that forwarded port instead.
