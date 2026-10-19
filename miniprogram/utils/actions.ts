export function showActionFailure(message: string): void {
  wx.showToast({ title: message, icon: "none" });
}

export function copyText(value: string): void {
  wx.setClipboardData({
    data: value,
    fail: () => showActionFailure("未能复制，请长按文字手动复制"),
  });
}

export function previewImage(path: string): void {
  // 先解析代码包资源，避免把包内相对路径直接交给预览页面。
  wx.getImageInfo({
    src: path,
    success: (image) => {
      wx.previewImage({
        current: image.path,
        urls: [image.path],
        fail: () => showActionFailure("暂时无法查看图片，请稍后重试"),
      });
    },
    fail: () => showActionFailure("暂时无法查看图片，请稍后重试"),
  });
}

export function callPhone(phoneNumber: string): void {
  wx.makePhoneCall({
    phoneNumber,
    fail: (error) => {
      if (error.errMsg.toLowerCase().includes("cancel")) return;
      showActionFailure("暂时无法拨号，请长按复制号码");
    },
  });
}
