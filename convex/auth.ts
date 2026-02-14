import { Auth, Portal } from "@robelest/convex-auth/component";
import GitHub from "@auth/core/providers/github";
import { components } from "./_generated/api";

// GitHub-only auth
export const auth = new Auth(components.auth, {
  providers: [GitHub],
  callbacks: {
    // Create an app-level user record on first sign-up
    async afterUserCreatedOrUpdated(ctx, args) {
      if (args.existingUserId) return; // Already has an account

      const profile = args.profile;
      await ctx.db.insert("users", {
        authUserId: args.userId as string,
        name: (profile.name as string) ?? undefined,
        email: (profile.email as string) ?? undefined,
        image: (profile.image as string) ?? undefined,
        onboardingComplete: false,
        llmConfig: {
          provider: "openrouter" as const,
          model: "anthropic/claude-sonnet-4",
          tokensUsedThisMonth: 0,
          tokenBudget: 100000,
        },
      });
    },
  },
});

export const { signIn, signOut, store } = auth;
export const { portalQuery, portalMutation, portalInternal } = Portal(auth);
