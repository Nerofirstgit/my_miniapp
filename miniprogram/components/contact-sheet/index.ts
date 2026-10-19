import { contact } from "../../data/profile";
import { callPhone, copyText, previewImage } from "../../utils/actions";

Component({
  properties: { visible: { type: Boolean, value: false } },
  data: { contact },
  methods: {
    close() { this.triggerEvent("close"); },
    keepOpen() {},
    copyWechat() { copyText(contact.wechat); },
    copyEmail() { copyText(contact.email); },
    call() { callPhone(contact.phone); },
    showQrCode() { previewImage(contact.qrCode); },
  },
});
