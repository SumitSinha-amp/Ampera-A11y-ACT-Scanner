import { useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  AtSign,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  UserRound,
  Upload,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function ProfileSettingsPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const profileImageSrc = user?.profileImageUrl
    ? `${BASE}/api/storage/profile-image?v=${encodeURIComponent(user.profileImageUrl)}`
    : null;

  async function handleProfileImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast({ title: "Unsupported image", description: "Choose a JPG, PNG, WebP, or GIF image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image is too large", description: "Profile images must be 5 MB or smaller.", variant: "destructive" });
      return;
    }
    setImageSaving(true);
    try {
      const urlResponse = await fetch(`${BASE}/api/auth/profile-image/upload-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size: file.size, contentType: file.type }),
      });
      const urlData = await urlResponse.json().catch(() => ({}));
      if (!urlResponse.ok) throw new Error(urlData.error || "Unable to prepare upload.");

      const uploadResponse = await fetch(urlData.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Unable to upload image.");

      const saveResponse = await fetch(`${BASE}/api/auth/profile-image`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath: urlData.objectPath, contentType: file.type }),
      });
      const saveData = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) throw new Error(saveData.error || "Unable to save profile image.");
      await refreshUser();
      toast({ title: "Profile image updated", description: "Your new image is now shown across the app." });
    } catch (imageError) {
      toast({
        title: "Profile image could not be updated",
        description: imageError instanceof Error ? imageError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setImageSaving(false);
    }
  }

  async function removeProfileImage() {
    setImageSaving(true);
    try {
      const response = await fetch(`${BASE}/api/auth/profile-image`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to remove profile image.");
      await refreshUser();
      toast({ title: "Profile image removed" });
    } catch (imageError) {
      toast({
        title: "Profile image could not be removed",
        description: imageError instanceof Error ? imageError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setImageSaving(false);
    }
  }

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setChanged(false);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${BASE}/api/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Unable to change your password.");
        return;
      }

      await refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChanged(true);
      toast({
        title: "Password changed",
        description: "Your new password is now active.",
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const initials = (user?.fullName || user?.username || "U")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">My Settings</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Profile settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal information and account security.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>
              Your personal information and account security settings.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center gap-4 space-y-0">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xl font-semibold text-white shadow-sm">
                {profileImageSrc ? (
                  <img src={profileImageSrc} alt="" className="h-full w-full rounded-full object-cover" />
                ) : initials}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleProfileImage}
                />
              </div>
              <div className="min-w-0">
                <CardTitle>{user?.fullName || user?.username || "Account"}</CardTitle>
                <CardDescription className="mt-1">
                  {user?.role?.replace(/_/g, " ") || "User"}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile image</CardTitle>
              <CardDescription>
                Add a square JPG, PNG, WebP, or GIF image up to 5 MB. It appears in your account menu and profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageSaving}>
                {imageSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {imageSaving ? "Saving image..." : profileImageSrc ? "Replace image" : "Upload image"}
              </Button>
              {profileImageSrc && (
                <Button type="button" variant="outline" onClick={removeProfileImage} disabled={imageSaving}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove image
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account details</CardTitle>
              <CardDescription>
                Information associated with your accessibility platform account.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-full-name">Full name</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="profile-full-name" value={user?.fullName || ""} readOnly className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-username">Username</Label>
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="profile-username" value={user?.username || ""} readOnly className="pl-9" />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="profile-email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="profile-email" type="email" value={user?.email || ""} readOnly className="pl-9" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                <CardTitle>Change password</CardTitle>
              </div>
              <CardDescription>
                Use your current password to set a new password for this account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {changed && (
                <Alert className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>Password changed successfully.</AlertDescription>
                </Alert>
              )}
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <PasswordField
                  id="profile-current-password"
                  label="Current password"
                  value={currentPassword}
                  visible={showCurrent}
                  onChange={setCurrentPassword}
                  onToggle={() => setShowCurrent((value) => !value)}
                />
                <PasswordField
                  id="profile-new-password"
                  label="New password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  visible={showNew}
                  onChange={setNewPassword}
                  onToggle={() => setShowNew((value) => !value)}
                />
                <PasswordField
                  id="profile-confirm-password"
                  label="Confirm new password"
                  value={confirmPassword}
                  visible={showConfirm}
                  onChange={setConfirmPassword}
                  onToggle={() => setShowConfirm((value) => !value)}
                />
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => navigate("/welcome")}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving password...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Change password
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  placeholder,
  value,
  visible,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={id.includes("current") ? "current-password" : "new-password"}
          required
          className="pr-10"
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}