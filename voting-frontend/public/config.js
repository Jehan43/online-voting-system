// Runtime settings. This file is copied as-is into the build (dist/config.js).
// You can change it in the S3 bucket after deploying, with no rebuild needed.
//
// "/api"  -> same domain as the website. CloudFront sends /api/* to the load
//            balancer. This is the recommended setting for deployment.
// Or use a full URL, e.g. "http://my-alb-123.us-east-1.elb.amazonaws.com/api"
// (a full URL on another domain needs CORS enabled on the backend).
window.APP_CONFIG = {
  API_BASE_URL: "http://voting-alb-987968332.us-east-1.elb.amazonaws.com/api",
};
