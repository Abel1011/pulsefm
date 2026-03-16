"use client";

import { useRadio } from "./RadioProvider";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

export default function NewsImageOverlay() {
  const { state } = useRadio();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const newsImage = state.newsImage;

  const images = newsImage?.imageUrls?.length
    ? newsImage.imageUrls
    : newsImage?.url
      ? [newsImage.url]
      : [];

  useEffect(() => {
    if (newsImage) {
      setDismissed(false);
      setCurrentIdx(0);
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [newsImage]);

  // Auto-rotate images every 6 seconds when there are multiple
  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % images.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [images.length]);

  const prev = useCallback(() => setCurrentIdx((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setCurrentIdx((i) => (i + 1) % images.length), [images.length]);

  if (!newsImage || dismissed || images.length === 0) return null;

  return (
    <div
      className={`fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-24 z-40
        sm:w-80 md:w-96 transition-all duration-500 ease-out
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-surface/95 backdrop-blur-xl shadow-2xl">
        <img
          src={images[currentIdx]}
          alt={newsImage.headline}
          className="w-full h-44 sm:h-48 object-cover transition-opacity duration-300"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />

        {/* Image navigation dots + arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center
                hover:bg-black/70 transition-colors text-white/70 hover:text-white"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={next}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center
                hover:bg-black/70 transition-colors text-white/70 hover:text-white"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    i === currentIdx ? "bg-white scale-125" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          </>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <span className="inline-block px-1.5 py-0.5 rounded-md bg-on-air/20 text-on-air text-[9px] font-heading font-bold tracking-wider uppercase mb-1.5">
            Breaking
          </span>
          <p className="text-xs font-medium text-white leading-snug line-clamp-2">
            {newsImage.headline}
          </p>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center
            hover:bg-black/70 transition-colors text-white/60 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
