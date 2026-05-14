"use client";

/**
 * Public join / onboarding page. An invited user lands here via a shared
 * invite link.
 *
 * Two flows:
 *   1. Unauthenticated visitor (someone pasting the link before signing up) —
 *      we redirect to /register?ref=<token> on mount so they go through the
 *      regular create-account flow with the agent toggle pre-on. The /register
 *      page reads ?ref / ?invite and pre-fills the referral code.
 *   2. Authenticated visitor — they confirm details and hit "Join Now" to
 *      redeem the invite and create their agent profile (the existing flow).
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useGetUserQuery } from "@/lib/api/auth";
import {
  useLookupInviteQuery,
  useRedeemInviteMutation,
} from "@/lib/api/real-estate/my-team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, CheckCircle2, ArrowRight, UserCheck } from "lucide-react";

interface JoinForm {
  name: string;
  email: string;
  phone: string;
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { toast } = useToast();

  // Detect auth state. If the visitor isn't signed in, hand off to the
  // registration page with the token as ?ref= so they go through the
  // standard create-account flow with the agent toggle pre-on. The
  // /register page picks up `ref` (or `invite`) from the URL.
  const { data: userData, isLoading: userLoading } = useGetUserQuery();
  const isAuthenticated = useMemo(() => Boolean(userData?.user?.id), [userData]);

  // Guard the redirect with a ref so it fires AT MOST ONCE per mount, even
  // if the effect re-runs because of an unstable router reference. Without
  // this, repeated router.replace calls created an updateDepth loop in
  // certain Next.js + react-redux combinations.
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (userLoading) return;
    if (redirectedRef.current) return;
    if (!isAuthenticated && token) {
      redirectedRef.current = true;
      router.replace(`/register?ref=${encodeURIComponent(token)}`);
    }
    // `router` intentionally omitted from deps — useRouter() doesn't
    // guarantee referential stability across renders in every Next.js
    // version, and including it caused the effect to re-fire on every
    // render. The redirect is a one-shot operation, guarded by the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, isAuthenticated, token]);

  const {
    data: inviteData,
    isLoading: loadingInvite,
    isError: inviteError,
  } = useLookupInviteQuery(token, { skip: !token || !isAuthenticated });

  const [redeemInvite] = useRedeemInviteMutation();

  const invite = inviteData?.data;
  const sponsor = invite?.sponsor;

  const [form, setForm] = useState<JoinForm>({
    name: "",
    email: "",
    phone: "",
  });
  const [joining, setJoining] = useState(false);
  const [success, setSuccess] = useState(false);

  // Pre-fill form once invite data loads.
  useEffect(() => {
    if (!invite) return;
    setForm({
      name: invite.prefillName ?? "",
      email: invite.prefillEmail ?? "",
      phone: invite.prefillPhone ?? "",
    });
  }, [invite]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!form.email.trim()) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    setJoining(true);
    try {
      await redeemInvite(token).unwrap();
      setSuccess(true);
    } catch (err: any) {
      toast({
        title: "Could not join",
        description: err?.data?.error || err?.message,
        variant: "destructive",
      });
    } finally {
      setJoining(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  // Includes the auth check and the unauthenticated-redirect window. We
  // never want to flash "Invite not found" while we're still deciding
  // whether to hand off to /register.
  if (userLoading || !isAuthenticated || loadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-10 w-3/4 mx-auto" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  // ── Invalid / expired token ──────────────────────────────────────────────
  if (inviteError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-3">
            <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
            <h2 className="text-lg font-semibold">Invite not found</h2>
            <p className="text-sm text-muted-foreground">
              This invite link may have expired or already been used.
            </p>
            <Button asChild variant="outline">
              <Link href="/real-estate">Go to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Success state ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500" />
            <div className="space-y-1">
              <h2 className="text-xl font-bold">Welcome aboard!</h2>
              <p className="text-sm text-muted-foreground">
                Your profile is pending KYC approval. Upload your documents to
                get started.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="/real-estate/compliance">
                Complete KYC
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isNamePrefilled = Boolean(invite.prefillName);
  const isEmailPrefilled = Boolean(invite.prefillEmail);
  const isPhonePrefilled = Boolean(invite.prefillPhone);

  const sponsorInitials = sponsor?.name
    ? sponsor.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w: string) => w[0].toUpperCase())
        .join("")
    : sponsor?.email.slice(0, 2).toUpperCase() ?? "?";

  // ── Main join form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md space-y-4">
        {/* Sponsor card */}
        {sponsor && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground font-normal">
                Invited by
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 flex items-center gap-3">
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarImage src={sponsor.image ?? undefined} />
                <AvatarFallback>{sponsorInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-semibold truncate">
                  {sponsor.name ?? sponsor.email}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {sponsor.email}
                </div>
                {sponsor.rank && (
                  <Badge variant="secondary" className="text-[10px] mt-1">
                    {sponsor.rank}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Join form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary shrink-0" />
              {sponsor?.name
                ? `Join ${sponsor.name}'s team`
                : "Join the team"}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Confirm your details below to complete your registration.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="space-y-3">
              <JoinField label="Full name">
                <Input
                  placeholder="Your full name"
                  value={form.name}
                  readOnly={isNamePrefilled}
                  onChange={(e) =>
                    !isNamePrefilled &&
                    setForm((s) => ({ ...s, name: e.target.value }))
                  }
                  className={isNamePrefilled ? "bg-muted/50" : ""}
                />
              </JoinField>

              <JoinField label="Email address">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  readOnly={isEmailPrefilled}
                  onChange={(e) =>
                    !isEmailPrefilled &&
                    setForm((s) => ({ ...s, email: e.target.value }))
                  }
                  className={isEmailPrefilled ? "bg-muted/50" : ""}
                />
              </JoinField>

              <JoinField label="Phone number">
                <Input
                  type="tel"
                  placeholder="+91 99999 00000"
                  value={form.phone}
                  readOnly={isPhonePrefilled}
                  onChange={(e) =>
                    !isPhonePrefilled &&
                    setForm((s) => ({ ...s, phone: e.target.value }))
                  }
                  className={isPhonePrefilled ? "bg-muted/50" : ""}
                />
              </JoinField>

              <div className="rounded-md border border-muted bg-muted/20 p-2.5 text-xs text-muted-foreground flex items-start gap-2">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  By joining, you agree to complete KYC verification. Your
                  profile will be pending approval until documents are reviewed.
                </span>
              </div>

              <Button
                type="submit"
                className="w-full mt-1"
                disabled={joining}
              >
                {joining ? "Joining…" : "Join now"}
                {!joining && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Invite expiry note */}
        <p className="text-center text-xs text-muted-foreground">
          This invite expires on{" "}
          <span className="font-medium">
            {new Date(invite.expiresAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </p>
      </div>
    </div>
  );
}

function JoinField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
