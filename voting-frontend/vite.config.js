import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For local development only.
// Calls to /api/... are forwarded to the backend running on your computer,
// so you do not need CORS while developing.
// (In production, CloudFront forwards /api/* to the load balancer instead.)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://voting-alb-987968332.us-east-1.elb.amazonaws.com",
    },
  },
});
