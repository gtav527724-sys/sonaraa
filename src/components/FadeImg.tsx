"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export default function FadeImg({
  className,
  alt = "",
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  const src = typeof rest.src === "string" ? rest.src : "";

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <img
      alt={alt}
      draggable={false}
      {...rest}
      src={src}
      onLoad={() => setLoaded(true)}
      className={cn(
        "bg-white/[0.04] transition-opacity duration-500 ease-out",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
