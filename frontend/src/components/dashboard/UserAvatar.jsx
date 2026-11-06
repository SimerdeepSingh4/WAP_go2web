import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function resolveImageUrl(value) {
  if (!value) return "";
  try {
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
    const apiOrigin = new URL(apiBase, window.location.origin).origin;
    return new URL(value, apiOrigin).href;
  } catch {
    return value;
  }
}

export default function UserAvatar({ user, className = "size-8" }) {
  const initials = String(user?.username || user?.email || "?")
    .trim()
    .slice(0, 2)
    .toUpperCase();
  const imageSrc = resolveImageUrl(user?.dp_img);

  return (
    <Avatar className={className} aria-hidden="true">
      {imageSrc && <AvatarImage src={imageSrc} alt="" />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
