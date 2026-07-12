import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AppIndex() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/app/deals");
  }, [setLocation]);

  return null;
}
