"use client";

import { useMedia } from "./MediaProvider";

export default function ContentArea({ children }: { children: React.ReactNode }) {
  const { expanded } = useMedia();

  return (
    <div
      className={`flex-1 flex flex-col transition-[margin] duration-500 ease-out ${
        expanded ? "lg:mr-[min(440px,45vw)]" : ""
      }`}
    >
      {children}
    </div>
  );
}
