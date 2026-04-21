import type { ChecklistDefinition } from "./types";

const DISK_C = { key: "disk-c", label: "C: Windows    Trống 60%" };
const DISK_F = { key: "disk-f", label: "F: Hình xe       Trống 40%" };
const DISK_G = { key: "disk-g", label: "G: Hình SV     Trống 70%" };

export const congKhuA: ChecklistDefinition = {
  key: "cong-khu-a",
  title: "DAILY CHECKLIST HỆ THỐNG KIỂM SOÁT RA VÀO CỔNG KHU A",
  groups: [
    {
      title: "",
      items: [
        {
          key: "khu-a-may-server",
          label: "Máy Server",
          standard:
            "CPU, LCD, Windows Server hoạt động bình thường (xoá rác vào ngày 01 và 15 hàng tháng)",
          type: "pass_fail",
          subchecks: [DISK_C, DISK_F, DISK_G],
        },
        {
          key: "khu-a-may-ks-xe-loi-ra",
          label: "Máy kiểm soát xe lối ra",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows    Trống 60%" }],
        },
        {
          key: "khu-a-may-ks-xe-loi-vao",
          label: "Máy kiểm soát xe lối vào",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows    Trống 60%" }],
        },
        {
          key: "khu-a-may-ks-bo-hanh-loi-ra",
          label: "Máy kiểm soát bộ hành lối ra",
          standard:
            "CPU, LCD, phần mềm kiểm soát bộ hành, kết nối mạng hoạt động bình thường",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows    Trống 60%" }],
        },
        {
          key: "khu-a-may-ks-bo-hanh-loi-vao",
          label: "Máy kiểm soát bộ hành lối vào",
          standard:
            "CPU, LCD, phần mềm kiểm soát bộ hành, kết nối mạng hoạt động bình thường",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows    Trống 60%" }],
        },
        {
          key: "khu-a-rfid-xe-may",
          label: "Đầu quét thẻ RFID (Xe máy)",
          standard: "8 Đầu quét thẻ có báo đèn và quét thẻ bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-a-gp90-bo-hanh",
          label: "Đầu quét thẻ GP90 (Bộ hành)",
          standard: "3 Đầu quét thẻ có báo đèn và quét thẻ bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-a-camera-cong",
          label: "Hệ thống camera kiểm soát cổng ra vào",
          standard: "10 Camera không bị mất kết nối",
          type: "pass_fail",
        },
        {
          key: "khu-a-barie",
          label: "Hệ thống Barie kiểm soát cổng ra vào",
          standard: "4 Barie hoạt động bình thường + Remote hoạt động bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-a-rada",
          label: "Rada cảm biến",
          standard: "4 Cảm biến hoạt động bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-a-ups-apc",
          label: "Hệ thống lưu điện APC -1",
          standard: "Hoạt động bình thường không báo lỗi",
          type: "pass_fail",
        },
        {
          key: "khu-a-ip-phone",
          label: "Điên thoại IP phone",
          standard: "01 điện thoại ip có nhận số nội bộ trên màn hình",
          type: "pass_fail",
        },
        {
          key: "khu-a-mang-internet",
          label: "Mạng Internet",
          standard: "Kết nối bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-a-camera-vong-ngoai",
          label: "Camera vòng ngoài",
          standard: "59 camera",
          type: "pass_fail",
        },
        {
          key: "khu-a-camera-do-thi",
          label: "Camera đô thị",
          standard: "11 camera",
          type: "pass_fail",
        },
      ],
    },
    {
      title: "PHÒNG SERVER A7",
      items: [
        {
          key: "khu-a-phong-a7-dau-ghi",
          label: "Đầu ghi",
          standard: "02 Hoạt động bình thường",
          type: "pass_fail",
        },
        {
          key: "khu-a-phong-a7-may-lanh",
          label: "Máy lạnh",
          standard: "02 Hoạt động bình thường",
          type: "pass_fail",
        },
      ],
    },
  ],
};
