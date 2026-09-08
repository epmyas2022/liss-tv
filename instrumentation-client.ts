import posthog from "posthog-js";

function initPostHog() {
  const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!posthogProjectToken || !posthogHost) {
    console.warn(
      "PostHog key or host is not defined. PostHog will not be initialized.",
    );
    return;
  }

  posthog.init(posthogProjectToken, {
    api_host: posthogHost,
    capture_pageview: false,
    capture_pageleave: false,
  });
}

initPostHog();
