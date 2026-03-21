"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, Camera, X, ArrowLeft } from "lucide-react";
import Link from "next/link";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  isPossiblePhoneNumber,
  isValidPhoneNumber,
} from "react-phone-number-input";
import {
  useGetUserQuery,
  useUploadAvatarMutation,
  useRemoveAvatarMutation,
  useUpdateProfileMutation,
} from "@/lib/api/auth";

interface UserProfile {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  mobile: string | null;
  location: string | null;
  department: string | null;
  email: string;
  avatar: string | null;
}

export default function UpdateProfilePage() {
  const router = useRouter();
  const { toast } = useToast();

  // RTK Query hooks
  const { data: userData, isLoading, isError, error: userError } = useGetUserQuery();
  const [uploadAvatar, { isLoading: isUploadingAvatar }] = useUploadAvatarMutation();
  const [removeAvatarMutation] = useRemoveAvatarMutation();
  const [updateProfile, { isLoading: isSaving }] = useUpdateProfileMutation();

  const [profile, setProfile] = useState<UserProfile>({
    first_name: "",
    last_name: "",
    username: "",
    phone: "",
    mobile: "",
    location: "",
    department: "",
    email: "",
    avatar: null,
  });

  const [phoneError, setPhoneError] = useState("");
  const [mobileError, setMobileError] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Populate profile from query data
  useEffect(() => {
    if (userData?.user && !profileLoaded) {
      const user = userData.user;
      setProfile({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        username: user.username || "",
        phone: user.phone || "",
        mobile: user.mobile || "",
        location: user.location || "",
        department: user.department || "",
        email: user.email || "",
        avatar: user.avatar || null,
      });
      setProfileLoaded(true);
    }
  }, [userData, profileLoaded]);

  // Handle auth error
  useEffect(() => {
    if (isError) {
      const status = (userError as any)?.status;
      if (status === 401) {
        router.push("/login");
      } else {
        toast({
          title: "Error",
          description: "Unable to load profile. Please log in again.",
          variant: "destructive",
        });
        router.push("/login");
      }
    }
  }, [isError, userError, router, toast]);

  // Validate phone number in real-time
  const validatePhone = (value: string | undefined) => {
    if (!value) {
      setPhoneError("");
      return true;
    }
    if (!isPossiblePhoneNumber(value)) {
      setPhoneError("Phone number is incomplete");
      return false;
    }
    if (!isValidPhoneNumber(value)) {
      setPhoneError("Invalid phone number for selected country");
      return false;
    }
    setPhoneError("");
    return true;
  };

  const validateMobile = (value: string | undefined) => {
    if (!value) {
      setMobileError("");
      return true;
    }
    if (!isPossiblePhoneNumber(value)) {
      setMobileError("Mobile number is incomplete");
      return false;
    }
    if (!isValidPhoneNumber(value)) {
      setMobileError("Invalid mobile number for selected country");
      return false;
    }
    setMobileError("");
    return true;
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setProfile({ ...profile, avatar: event.target?.result as string });
    };
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const result = await uploadAvatar(formData).unwrap();

      setProfile({ ...profile, avatar: (result as any).avatarUrl || (result as any).url });

      toast({
        title: "Avatar Updated",
        description: "Your profile picture has been changed.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.data?.error || err.message || "Failed to upload image",
        variant: "destructive",
      });
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile.avatar) return;

    try {
      await removeAvatarMutation().unwrap();

      setProfile({ ...profile, avatar: null });

      toast({
        title: "Avatar Removed",
        description: "Your profile picture has been removed.",
      });

      router.push("/profile?refresh=" + Date.now());
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.data?.error || err.message || "Failed to remove avatar",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    // Final validation before saving
    const phoneValid = validatePhone(profile.phone);
    const mobileValid = validateMobile(profile.mobile);

    if (!phoneValid || !mobileValid) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter valid and complete phone/mobile numbers.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateProfile({
        first_name: profile.first_name,
        last_name: profile.last_name,
        username: profile.username,
        phone: profile.phone || null,
        mobile: profile.mobile || null,
        location: profile.location,
        department: profile.department,
      }).unwrap();

      toast({
        title: "Profile Updated",
        description: "All changes saved successfully.",
      });

      router.push("/profile?refresh=" + Date.now());
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.data?.error || err.message || "Failed to save changes",
        variant: "destructive",
      });
    }
  };

  const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Your Name";
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="flex items-center space-x-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <span className="text-lg font-medium text-gray-700">Loading profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="h-9 w-9 bg-blue-600 rounded-lg flex items-center justify-center">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">My Profile</h1>
            </div>
            <Link href="/profile">
              <Button variant="ghost" size="sm" className="text-gray-600">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardContent className="p-8">
            <div className="grid md:grid-cols-3 gap-8">
              {/* Avatar Section */}
              <div className="md:col-span-1">
                <div className="text-center">
                  <div className="relative inline-block">
                    <Avatar className="h-40 w-40 mx-auto border-4 border-gray-200">
                      {profile.avatar ? (
                        <AvatarImage src={profile.avatar} alt={fullName} />
                      ) : (
                        <AvatarFallback className="bg-blue-600 text-white text-4xl font-medium">
                          {initials || "U"}
                        </AvatarFallback>
                      )}
                    </Avatar>

                    <input
                      type="file"
                      accept="image/*"
                      id="avatar-upload"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />

                    <label
                      htmlFor="avatar-upload"
                      className="absolute bottom-0 right-0 h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg hover:bg-blue-700 transition-all cursor-pointer"
                    >
                      {isUploadingAvatar ? (
                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                      ) : (
                        <Camera className="h-5 w-5 text-white" />
                      )}
                    </label>

                    {profile.avatar && (
                      <button
                        onClick={handleRemoveAvatar}
                        className="absolute top-0 right-0 h-8 w-8 rounded-full bg-red-600 flex items-center justify-center shadow-lg hover:bg-red-700 transition-all"
                        title="Remove avatar"
                      >
                        <X className="h-4 w-4 text-white" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Form Fields */}
              <div className="md:col-span-2 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input
                      value={profile.first_name || ""}
                      onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                      placeholder="First Name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      value={profile.last_name || ""}
                      onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                      placeholder="Last Name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={profile.username || ""}
                    onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                    placeholder="Username"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={profile.email} disabled className="bg-gray-50" />
                </div>

                {/* Phone with Country Code + Validation */}
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <PhoneInput
                    international
                    countryCallingCodeEditable={false}
                    defaultCountry="US"
                    value={profile.phone || ""}
                    onChange={(value) => {
                      const stringValue = value || "";
                      setProfile({ ...profile, phone: stringValue });
                      validatePhone(stringValue);
                    }}
                    className={cn(
                      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      phoneError && "border-red-500 focus-visible:ring-red-500"
                    )}
                    style={{ fontFamily: "inherit" }}
                  />
                  {phoneError && (
                    <p className="text-sm text-red-600 mt-1">{phoneError}</p>
                  )}
                </div>

                {/* Mobile with Country Code + Validation */}
                <div className="space-y-2">
                  <Label>Mobile</Label>
                  <PhoneInput
                    international
                    countryCallingCodeEditable={false}
                    defaultCountry="IN"
                    value={profile.mobile || ""}
                    onChange={(value) => {
                      const stringValue = value || "";
                      setProfile({ ...profile, mobile: stringValue });
                      validateMobile(stringValue);
                    }}
                    className={cn(
                      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      mobileError && "border-red-500 focus-visible:ring-red-500"
                    )}
                    style={{ fontFamily: "inherit" }}
                  />
                  {mobileError && (
                    <p className="text-sm text-red-600 mt-1">{mobileError}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input
                      value={profile.location || ""}
                      onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                      placeholder="City, Country"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Input
                      value={profile.department || ""}
                      onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                      placeholder="Department"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-6">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving || !!phoneError || !!mobileError}
                    className="px-8 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}