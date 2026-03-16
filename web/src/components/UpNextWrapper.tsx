"use client";

import { useMedia } from "./MediaProvider";

export default function UpNextWrapper({ children }: { children: React.ReactNode }) {
  const { expanded } = useMedia();

  if (expanded) return null;

  return (
    <div className="hidden lg:block fixed right-6 top-1/2 -translate-y-1/2 z-10 w-52">
      {children}
    </div>
  );
}
