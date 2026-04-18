import type { ChecklistDefinition } from "./types";

export const congKhuB: ChecklistDefinition = {
  key: "cong-khu-b",
  title: "Checklist ra vào cổng Khu B",
  groups: [
    {
      title: "Hệ thống kiểm soát ra vào cổng",
      items: [
        {
          key: "khu-b-may-server",
          label: "Máy Server",
          standard:
            "CPU, LCD, Windows Server hoạt động bình thường (xoá rác vào ngày 01 và 15 hàng tháng).",
          type: "pass_fail",
          subchecks: [
            { key: "disk-c", label: "C: Windows — trống ≥ 60%" },
            { key: "disk-f", label: "F: Hình xe — trống ≥ 40%" },
            { key: "disk-g", label: "G: Hình SV — trống ≥ 70%" },
          ],
        },
        {
          key: "khu-b-may-ks-xe-loi-ra",
          label: "Máy kiểm soát xe lối ra",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường.",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows — trống ≥ 60%" }],
        },
        {
          key: "khu-b-may-ks-xe-loi-vao",
          label: "Máy kiểm soát xe lối vào",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường.",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows — trống ≥ 60%" }],
        },
        {
          key: "khu-b-faceid-cong-1",
          label: "Máy kiểm soát bộ hành bằng FaceID cổng 1 (8 cái)",
          standard:
            "Phần mềm kiểm soát bộ hành, kết nối mạng, barrie hoạt động bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-b-faceid-cong-2",
          label: "Máy kiểm soát bộ hành bằng FaceID cổng 2 (8 cái)",
          standard:
            "Phần mềm kiểm soát bộ hành, kết nối mạng, barrie hoạt động bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-b-lan-phu-loi-ra",
          label: "Máy kiểm soát xe làn phụ lối ra",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-b-lan-phu-loi-vao",
          label: "Máy kiểm soát xe làn phụ lối vào",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-b-xe-ra-vao-cong-2",
          label: "Máy kiểm soát xe ra vào cổng số 2",
          standard: "CPU, LCD, phần mềm kiểm soát xe hoạt động bình thường.",
          type: "pass_fail",
          subchecks: [{ key: "disk-c", label: "C: Windows — trống ≥ 60%" }],
        },
        {
          key: "khu-b-rfid-xe-may",
          label: "Đầu quét thẻ RFID (Xe máy)",
          standard: "8 đầu quét thẻ có báo đèn và quét thẻ bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-b-camera-cong",
          label: "Hệ thống camera kiểm soát cổng ra vào",
          standard: "20 camera không bị mất kết nối.",
          type: "pass_fail",
        },
      ],
    },
    {
      title: "Thiết bị & hạ tầng cổng",
      items: [
        {
          key: "khu-b-barie",
          label: "Hệ thống Barie kiểm soát cổng ra vào",
          standard: "4 Barie hoạt động bình thường + Remote hoạt động bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-b-rada",
          label: "Rada cảm biến",
          standard: "4 cảm biến hoạt động bình thường.",
          type: "pass_fail",
        },
        {
          key: "khu-b-ups-apc",
          label: "Hệ thống lưu điện APC-1",
          standard: "Hoạt động bình thường, không báo lỗi.",
          type: "pass_fail",
        },
        {
          key: "khu-b-ip-phone",
          label: "Điện thoại IP phone",
          standard: "4 điện thoại IP có nhận số nội bộ trên màn hình.",
          type: "pass_fail",
        },
        {
          key: "khu-b-mang-internet",
          label: "Mạng Internet",
          standard: "Kết nối bình thường.",
          type: "pass_fail",
        },
      ],
    },
  ],
};
