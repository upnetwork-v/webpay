import React from "react";

interface PhantomDownloadPromptProps {
  onClose: () => void;
}

export const PhantomDownloadPrompt: React.FC<PhantomDownloadPromptProps> = ({
  onClose,
}) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
      <div className="bg-white p-6 rounded shadow-lg max-w-xs text-center">
        <div className="text-lg font-semibold mb-2">未检测到 Phantom 钱包</div>
        <div className="mb-4 text-sm text-gray-600">
          未检测到 Phantom 钱包应用。请先下载安装后再尝试支付。
        </div>
        <a
          href="https://phantom.app/download"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 mb-2"
        >
          前往下载 Phantom
        </a>
        <br />
        <button
          className="text-gray-500 text-xs underline mt-2"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
};
