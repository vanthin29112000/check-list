import type { ChecklistDefinition } from "./types";

const DISK_C = { key: "disk-c", label: "C: Windows    Trống 60%" };
const DISK_F = { key: "disk-f", label: "F: Hình xe       Trống 40%" };
const DISK_G = { key: "disk-g", label: "G: Hình SV     Trống 70%" };

export const congKhuB: ChecklistDefinition = {
  key: "cong-khu-b",
  title: "DAILY CHECKLIST HỆ THỐNG KIỂM SOÁT RA VÀO CỔNG KHU B",
  groups: [
    {
      title: "",
      items: [
        {
          key: "khu-b-may-server",
          label: "Máy Server",
          standard:
            "CPU, LCD, Windows Server hoạt động bình thường (xoá rác vào ngày 01 và 15 hàng tháng)",
          type: "pass_fail",
          subchecks: [DISK_C, DISK_F, DISK_G],
        },
        {
          key: "khu-b-may-ks-xe-loi-ra",
          label: "Máy kiểm soát xe lối ra",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows    Trống 60%" }],
        },
        {
          key: "khu-b-may-ks-xe-loi-vao",
          label: "Máy kiểm soát xe lối vào",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows    Trống 60%" }],
        },
        {
          key: "khu-b-faceid-cong-1",
          label: "Máy kiểm soát bộ hành bằng FaceID cổng 1 (8 cái)",
          standard:
            "Phần mềm kiểm soát bộ hành, kết nối mạng, barrie hoạt động bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-b-faceid-cong-2",
          label: "Máy kiểm soát bộ hành bằng FaceID cổng 2 (8 cái)",
          standard:
            "Phần mềm kiểm soát bộ hành, kết nối mạng, barrie hoạt động bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-b-lan-phu-loi-ra",
          label: "Máy kiểm soát xe làn phụ lối ra",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-b-lan-phu-loi-vao",
          label: "Máy kiểm soát xe làn phụ lối vào",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-b-xe-ra-vao-cong-2",
          label: "Máy kiểm soát xe ra vào cổng số 2",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows    Trống 60%" }],
        },
        {
          key: "khu-b-rfid-xe-may",
          label: "Đầu quét thẻ RFID (Xe máy)",
          standard: "8 Đầu quét thẻ có báo đèn và quét thẻ bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-b-camera-cong",
          label: "Hệ thống camera kiểm soát cổng ra vào",
          standard: "20 Camera không bị mất kết nối",
          type: "pass_fail",
        },
        {
          key: "khu-b-barie",
          label: "Hệ thống Barie kiểm soát cổng ra vào",
          standard: "4 Barie hoạt động bình thường + Remote hoạt động bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-b-rada",
          label: "Rada cảm biến",
          standard: "4 Cảm biến hoạt động bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-b-ups-apc",
          label: "Hệ thống lưu điện APC-1",
          standard: "Hoạt động bình thường không báo lỗi",
          type: "pass_fail",
        },
        {
          key: "khu-b-ip-phone",
          label: "Điên thoại IP phone",
          standard: "4 điện thoại ip có nhận số nội bộ trên màn hình",
          type: "pass_fail",
        },
        {
          key: "khu-b-mang-internet",
          label: "Mạng Internet",
          standard: "Kết nối bình thường",
          type: "pass_fail",
        },
      ],
    },
  ],
};
