// "use client";

// import { useState, useEffect } from "react";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Switch } from "@/components/ui/switch";
// import { useToast } from "@/hooks/use-toast";
// import { Loader2, Shield, Lock, Smartphone, Globe, CheckCircle, LogOut } from "lucide-react";
// import Link from "next/link";

// interface Session {
//   id: string;
//   expires: string;
//   isCurrent?: boolean;
//   device: string;
//   lastActive: string;
// }

// export default function SecuritySettingsPage() {
//   const { toast } = useToast();

//   const [isChangingPassword, setIsChangingPassword] = useState(false);
//   const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
//   const [isLoading2FA, setIsLoading2FA] = useState(true);
//   const [sessions, setSessions] = useState<Session[]>([]);
//   const [isLoadingSessions, setIsLoadingSessions] = useState(true);

//   const [passwordForm, setPasswordForm] = useState({
//     currentPassword: "",
//     newPassword: "",
//     confirmPassword: "",
//   });

//   useEffect(() => {
//     const loadSecurityData = async () => {
//       try {
//         const userRes = await fetch("/api/auth/me");
//         if (userRes.ok) {
//           const userData = await userRes.json();
//           setTwoFactorEnabled(userData.twoFactorEnabled || false);
//         }
//       } catch (err) {
//         console.error("Failed to load 2FA status");
//       } finally {
//         setIsLoading2FA(false);
//       }

//       try {
//         const sessionsRes = await fetch("/api/auth/sessions");
//         if (sessionsRes.ok) {
//           const data = await sessionsRes.json();
//           setSessions(data.sessions || []);
//         }
//       } catch (err) {
//         toast({
//           title: "Error",
//           description: "Could not load active sessions",
//           variant: "destructive",
//         });
//       } finally {
//         setIsLoadingSessions(false);
//       }
//     };

//     loadSecurityData();
//   }, [toast]);

//   const handlePasswordChange = async (e: React.FormEvent) => {
//     e.preventDefault();

//     if (passwordForm.newPassword !== passwordForm.confirmPassword) {
//       toast({
//         title: "Error",
//         description: "New passwords do not match",
//         variant: "destructive",
//       });
//       return;
//     }

//     if (passwordForm.newPassword.length < 8) {
//       toast({
//         title: "Error",
//         description: "New password must be at least 8 characters",
//         variant: "destructive",
//       });
//       return;
//     }

//     setIsChangingPassword(true);

//     try {
//       const res = await fetch("/api/auth/change-password", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           currentPassword: passwordForm.currentPassword,
//           newPassword: passwordForm.newPassword,
//         }),
//       });

//       const data = await res.json();

//       if (!res.ok) throw new Error(data.error || "Failed to change password");

//       toast({
//         title: "Success",
//         description: "Your password has been updated successfully!",
//       });

//       setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
//     } catch (err: any) {
//       toast({
//         title: "Error",
//         description: err.message || "Failed to update password",
//         variant: "destructive",
//       });
//     } finally {
//       setIsChangingPassword(false);
//     }
//   };

//   const handleToggle2FA = async (enabled: boolean) => {
//     const previousState = twoFactorEnabled;
//     setTwoFactorEnabled(enabled);

//     try {
//       const res = await fetch("/api/auth/toggle-2fa", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ enabled }),
//       });

//       if (!res.ok) {
//         const data = await res.json();
//         throw new Error(data.error || "Failed to update 2FA");
//       }

//       toast({
//         title: enabled ? "2FA Enabled" : "2FA Disabled",
//         description: enabled
//           ? "Two-factor authentication is now active"
//           : "Two-factor authentication has been turned off",
//       });
//     } catch (err: any) {
//       setTwoFactorEnabled(previousState);
//       toast({
//         title: "Error",
//         description: err.message || "Failed to update 2FA settings",
//         variant: "destructive",
//       });
//     }
//   };

//   const handleRevokeSession = async (sessionId: string) => {
//     if (sessionId === "current") {
//       toast({
//         title: "Cannot revoke",
//         description: "You cannot revoke your current session",
//         variant: "destructive",
//       });
//       return;
//     }

//     try {
//       await fetch(`/api/auth/sessions/${sessionId}`, { method: "DELETE" });
//       setSessions(sessions.filter((s) => s.id !== sessionId));
//       toast({ title: "Success", description: "Session revoked" });
//     } catch {
//       toast({ title: "Error", description: "Failed to revoke session", variant: "destructive" });
//     }
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
//       {/* Header */}
//       <div className="bg-white border-b border-gray-200 shadow-sm">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//           <div className="flex items-center justify-between py-6">
//             <div className="flex items-center space-x-4">
//               <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
//                 <Shield className="h-6 w-6 text-white" />
//               </div>
//               <div>
//                 <h1 className="text-2xl font-bold text-gray-900">Security Settings</h1>
//                 <p className="text-sm text-gray-600">Manage your account security and login preferences</p>
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Main Content */}
//       <div className="max-w-4xl mx-auto px-4 lg:px-8 py-10 space-y-8">
//         {/* Change Password */}
//         <Card>
//           <CardHeader>
//             <CardTitle className="flex items-center gap-3">
//               <Lock className="h-5 w-5 text-red-600" />
//               Change Password
//             </CardTitle>
//             <CardDescription>
//               Ensure your account is protected with a strong, unique password.
//             </CardDescription>
//           </CardHeader>
//           <CardContent>
//             <form onSubmit={handlePasswordChange} className="space-y-6">
//               <div className="space-y-2">
//                 <Label htmlFor="current">Current Password</Label>
//                 <Input
//                   id="current"
//                   type="password"
//                   placeholder="••••••••"
//                   value={passwordForm.currentPassword}
//                   onChange={(e) =>
//                     setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
//                   }
//                   required
//                 />
//                 <div className="text-right">
//                   <Link
//                     href="/forgot-password"
//                     className="text-sm text-blue-600 hover:underline font-medium"
//                   >
//                     Forgot current password?
//                   </Link>
//                 </div>
//               </div>

//               <div className="space-y-2">
//                 <Label htmlFor="new">New Password</Label>
//                 <Input
//                   id="new"
//                   type="password"
//                   placeholder="••••••••"
//                   value={passwordForm.newPassword}
//                   onChange={(e) =>
//                     setPasswordForm({ ...passwordForm, newPassword: e.target.value })
//                   }
//                   required
//                 />
//               </div>

//               <div className="space-y-2">
//                 <Label htmlFor="confirm">Confirm New Password</Label>
//                 <Input
//                   id="confirm"
//                   type="password"
//                   placeholder="••••••••"
//                   value={passwordForm.confirmPassword}
//                   onChange={(e) =>
//                     setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
//                   }
//                   required
//                 />
//               </div>

//               <div className="flex justify-end">
//                 <Button type="submit" disabled={isChangingPassword}>
//                   {isChangingPassword ? (
//                     <>
//                       <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                       Updating...
//                     </>
//                   ) : (
//                     "Update Password"
//                   )}
//                 </Button>
//               </div>
//             </form>
//           </CardContent>
//         </Card>

//         {/* Active Sessions */}
//         <Card>
//           <CardHeader>
//             <CardTitle className="flex items-center gap-3">
//               <Globe className="h-5 w-5 text-purple-600" />
//               Active Sessions
//             </CardTitle>
//             <CardDescription>
//               View and manage devices currently signed into your account.
//             </CardDescription>
//           </CardHeader>
//           <CardContent>
//             {isLoadingSessions ? (
//               <div className="flex items-center justify-center py-8">
//                 <Loader2 className="h-5 w-5 animate-spin" />
//               </div>
//             ) : sessions.length === 0 ? (
//               <div className="text-center py-8 text-muted-foreground">
//                 <Globe className="h-12 w-12 mx-auto mb-4 text-gray-300" />
//                 <p>No active sessions found.</p>
//                 <p className="text-sm mt-2">Your current session will appear here.</p>
//               </div>
//             ) : (
//               <div className="space-y-4">
//                 {sessions.map((session) => (
//                   <div
//                     key={session.id}
//                     className="flex items-center justify-between p-4 border rounded-lg bg-muted/30"
//                   >
//                     <div>
//                       <p className="font-medium">{session.device || "Unknown Device"}</p>
//                       <p className="text-sm text-muted-foreground">
//                         Last active: {new Date(session.expires).toLocaleString()}
//                         {session.isCurrent && (
//                           <span className="ml-2 text-green-600 font-medium">(Current Session)</span>
//                         )}
//                       </p>
//                     </div>
//                     <Button
//                       variant="destructive"
//                       size="sm"
//                       onClick={() => handleRevokeSession(session.id)}
//                       disabled={session.isCurrent}
//                     >
//                       <LogOut className="h-4 w-4 mr-1" />
//                       Revoke
//                     </Button>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </CardContent>
//         </Card>
//       </div>
//     </div>
//   );
// }


"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, Lock, Globe, CheckCircle, LogOut } from "lucide-react";
import Link from "next/link";

interface Session {
  id: string;
  expires: string;
  isCurrent?: boolean;
  device: string;
  lastActive: string;
}

export default function SecuritySettingsPage() {
  const { toast } = useToast();

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [isLoading2FA, setIsLoading2FA] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const loadSecurityData = async () => {
      try {
        const userRes = await fetch("/api/auth/me");
        if (userRes.ok) {
          const userData = await userRes.json();
          setTwoFactorEnabled(userData.twoFactorEnabled || false);
        }
      } catch (err) {
        console.error("Failed to load 2FA status");
      } finally {
        setIsLoading2FA(false);
      }

      try {
        const sessionsRes = await fetch("/api/auth/sessions");
        if (sessionsRes.ok) {
          const data = await sessionsRes.json();
          setSessions(data.sessions || []);
        }
      } catch (err) {
        toast({
          title: "Error",
          description: "Could not load active sessions",
          variant: "destructive",
        });
      } finally {
        setIsLoadingSessions(false);
      }
    };

    loadSecurityData();
  }, [toast]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast({
        title: "Error",
        description: "New password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to change password");
      }

      // Success: Password changed successfully
      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully. You are now being signed out for security reasons.",
      });

      // Clear the form
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });

      window.location.href = "/login?reason=password_changed";

    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update password",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleToggle2FA = async (enabled: boolean) => {
    const previousState = twoFactorEnabled;
    setTwoFactorEnabled(enabled);

    try {
      const res = await fetch("/api/auth/toggle-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update 2FA");
      }

      toast({
        title: enabled ? "2FA Enabled" : "2FA Disabled",
        description: enabled
          ? "Two-factor authentication is now active"
          : "Two-factor authentication has been turned off",
      });
    } catch (err: any) {
      setTwoFactorEnabled(previousState);
      toast({
        title: "Error",
        description: err.message || "Failed to update 2FA settings",
        variant: "destructive",
      });
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (sessionId === "current") {
      toast({
        title: "Cannot revoke",
        description: "You cannot revoke your current session",
        variant: "destructive",
      });
      return;
    }

    try {
      await fetch(`/api/auth/sessions/${sessionId}`, { method: "DELETE" });
      setSessions(sessions.filter((s) => s.id !== sessionId));
      toast({ title: "Success", description: "Session revoked" });
    } catch {
      toast({ title: "Error", description: "Failed to revoke session", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Security Settings</h1>
                <p className="text-sm text-gray-600">Manage your account security and login preferences</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-10 space-y-8">
        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-red-600" />
              Change Password
            </CardTitle>
            <CardDescription>
              Ensure your account is protected with a strong, unique password. Changing your password will sign you out of all devices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="current">Current Password</Label>
                <Input
                  id="current"
                  type="password"
                  placeholder="••••••••"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                  }
                  required
                />
                <div className="text-right">
                  <Link
                    href="/forgot-password"
                    className="text-sm text-blue-600 hover:underline font-medium"
                  >
                    Forgot current password?
                  </Link>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new">New Password</Label>
                <Input
                  id="new"
                  type="password"
                  placeholder="••••••••"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm New Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="••••••••"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                  }
                  required
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-purple-600" />
              Active Sessions
            </CardTitle>
            <CardDescription>
              View and manage devices currently signed into your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSessions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No active sessions found.</p>
                <p className="text-sm mt-2">Your current session will appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 border rounded-lg bg-muted/30"
                  >
                    <div>
                      <p className="font-medium">{session.device || "Unknown Device"}</p>
                      <p className="text-sm text-muted-foreground">
                        Last active: {new Date(session.lastActive).toLocaleString()}
                        {session.isCurrent && (
                          <span className="ml-2 text-green-600 font-medium">(Current Session)</span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRevokeSession(session.id)}
                      disabled={session.isCurrent}
                    >
                      <LogOut className="h-4 w-4 mr-1" />
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}