"use client";

/**
 * Post-registration agent onboarding page.
 *
 * Lands here from VerifyOTPView when the user signed up with a referral code.
 * Auto-runs the onboard mutation, which resolves the referral code, places
 * the user under the sponsor's tree, and creates their AgentProfile.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import Link from "next/link";
import {
  useLookupReferralQuery,
  useOnboardAsAgentMutation,
} from "@/lib/api/real-estate/my-team";
import { baseApi } from "@/lib/api/baseApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  ArrowRight,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "exists" }
  | { kind: "error"; message: string };

export default function OnboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
          <Card className="w-full max-w-md">
            <CardContent className="py-10 text-center space-y-5">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 text-primary mx-auto">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold">Loading…</h1>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <OnboardPageInner />
    </Suspense>
  );
}

function OnboardPageInner() {
  const router = useRouter();
  const dispatch = useDispatch();
  const searchParams = useSearchParams();
  const code = (searchParams?.get("code") ?? "").trim();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const ranRef = useRef(false);

  const [onboardAsAgent] = useOnboardAsAgentMutation();
  const {
    data: lookupData,
    isLoading: lookupLoading,
  } = useLookupReferralQuery(code, { skip: !code });

  const sponsor = lookupData?.data.sponsor ?? null;

  // Stash hooks in refs so the effect deps stay strictly on `code`. The
  // effect must be a one-shot — re-firing would re-enter the mutation
  // and was the source of the "Maximum update depth exceeded" loop when
  // useDispatch / useRouter returned non-stable references on re-render.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const routerRef = useRef(router);
  routerRef.current = router;
  const mutationRef = useRef(onboardAsAgent);
  mutationRef.current = onboardAsAgent;

  useEffect(() => {
    if (!code) {
      setPhase({
        kind: "error",
        message: "Missing referral code. Please use a valid invite or sponsor link.",
      });
      return;
    }
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      setPhase({ kind: "loading" });
      try {
        const result = await mutationRef.current({ referralCode: code }).unwrap();

        // The onboard endpoint may have linked the user to a new organization
        // and granted access to the real-estate module. The auth-meta cookie
        // (which gates routes via the middleware) was issued at OTP-verify
        // time when the user had no org — refresh it now so the new
        // organization + role state takes effect immediately. Also blow away
        // the RTK "User" cache so the sidebar and useGetUserQuery consumers
        // re-fetch the post-onboard user.
        try {
          await fetch("/api/auth/refresh-meta", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          });
        } catch {
          // Best-effort. If it fails, the user can still navigate; the cookie
          // will refresh on the next perm-version poll (max 15s).
        }
        dispatchRef.current(baseApi.util.invalidateTags(["User"]));

        if (result.alreadyExists) {
          setPhase({ kind: "exists" });
        } else {
          setPhase({ kind: "success" });
        }
      } catch (err: any) {
        const status = err?.status;
        const message =
          err?.data?.error ||
          err?.message ||
          "Could not complete agent onboarding.";
        if (status === 401) {
          routerRef.current.replace("/login");
          return;
        }
        setPhase({ kind: "error", message });
      }
    })();
    // Intentionally narrow deps to `code` — all other hooks accessed via
    // refs above. See block comment for the loop this prevents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const sponsorName = sponsor?.name ?? sponsor?.email ?? null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardContent className="py-10 text-center space-y-5">
          {(phase.kind === "loading" ||
            phase.kind === "idle" ||
            (lookupLoading && phase.kind !== "error")) && (
            <>
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 text-primary mx-auto">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold">Setting up your agent profile…</h1>
                <p className="text-sm text-muted-foreground">
                  Hang tight while we connect you to your sponsor&apos;s team.
                </p>
              </div>
            </>
          )}

          {phase.kind === "success" && (
            <>
              <CheckCircle2
                className="h-14 w-14 mx-auto text-emerald-500"
                aria-hidden="true"
              />
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold">You&apos;re in!</h1>
                <p className="text-sm text-muted-foreground">
                  {sponsorName
                    ? `Welcome to ${sponsorName}'s team.`
                    : "Welcome to the team."}{" "}
                  Complete your KYC to start earning.
                </p>
              </div>
              {/* Hard navigation (window.location) is intentional — we just
                  refreshed the auth-meta cookie and the user record, so
                  forcing a full page load guarantees the new org + perms
                  are picked up by every server-rendered guard. */}
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    window.location.href = "/real-estate/compliance";
                  }}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" aria-hidden="true" />
                  Complete KYC
                  <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    window.location.href = "/real-estate";
                  }}
                >
                  Go to dashboard
                </Button>
              </div>
            </>
          )}

          {phase.kind === "exists" && (
            <>
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-amber-100 text-amber-700 mx-auto dark:bg-amber-900/30 dark:text-amber-300">
                <Info className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold">You&apos;re already an agent</h1>
                <p className="text-sm text-muted-foreground">
                  You already have an agent profile in this organization.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  window.location.href = "/real-estate/my-team";
                }}
              >
                <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
                Go to my team
                <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
              </Button>
            </>
          )}

          {phase.kind === "error" && (
            <>
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-destructive/10 text-destructive mx-auto">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold">Onboarding failed</h1>
                <p className="text-sm text-muted-foreground">{phase.message}</p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/real-estate">Back to dashboard</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
