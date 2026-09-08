import posthog from "posthog-js";

export const analytics = {
  login: (id: string, name: string, email: string) => {
    posthog.identify(id, { name, email });
  },

  userActive: (email: string) => {
    posthog.capture("user_active", { email });
  },

  watchVideo: (title: string, link: string) => {
    posthog.capture("watch_video", { title, link });
  },

};
