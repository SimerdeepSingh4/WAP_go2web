import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveUserImageUrl } from "./profileImage";

export default function UserAvatar({ user, className = "size-8" }) {
  const initials = String(user?.username || user?.email || "?")
    .trim()
    .slice(0, 2)
    .toUpperCase();
  const imageSrc = resolveUserImageUrl(user?.dp_img);

  return (
    <Avatar className={className} aria-hidden="true">
      {imageSrc && <AvatarImage src={imageSrc} alt="" />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
