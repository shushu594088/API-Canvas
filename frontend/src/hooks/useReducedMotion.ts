import { useEffect, useState } from "react";

/**
 * 读取系统 prefers-reduced-motion，并把结果写到 <html data-rm>，
 * 让 tokens.css 中的时长变量自动降级；返回值供组件做结构级降级。
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(mq.matches);
      if (mq.matches) document.documentElement.dataset.rm = "";
      else delete document.documentElement.dataset.rm;
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}
