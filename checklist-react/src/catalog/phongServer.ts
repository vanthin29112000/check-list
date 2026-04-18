import type { ChecklistDefinition, ChecklistGroupDef, ChecklistItemDef } from "./types";

function item(key: string, label: string, standard: string): ChecklistItemDef {
  return { key, label, standard, type: "pass_fail" };
}

function buildPhongServerGroups(): ChecklistGroupDef[] {
  const g1: ChecklistGroupDef = {
    title: "1. Thiết bị vật lý",
    items: [
      item("ps-1-1", "1.1. Dell EMC R650 -1", "LCD không báo lỗi, đèn tín hiệu màu xanh lá hoặc xanh dương"),
      item("ps-1-2", "1.2. Dell EMC R650 -2", "LCD không báo lỗi, đèn tín hiệu màu xanh lá hoặc xanh dương"),
      item("ps-1-3", "1.3. Dell EMC PV ME5024", "LCD không báo lỗi, đèn tín hiệu màu xanh lá hoặc xanh dương"),
      item("ps-1-4", "1.4. Dell EMC R750", "LCD không báo lỗi, đèn tín hiệu màu xanh lá hoặc xanh dương"),
      item("ps-1-5", "1.5. Máy chủ iVSS", "LCD không báo lỗi, đèn tín hiệu màu xanh lá hoặc xanh dương"),
      item("ps-1-6", "1.6. Thiết bị lưu trữ VMS", "LCD không báo lỗi, đèn tín hiệu màu xanh lá hoặc xanh dương"),
    ],
  };
  const g2: ChecklistGroupDef = {
    title: "2. Thiết bị Switch",
    items: [
      item("ps-2-1", "2.1. Switch Cisco SG300-20", "Các đèn tín hiệu ổn, không có Port bị Down, LCD màu xanh lá"),
      item("ps-2-2", "2.2. Dell EMC S3148 -1", "Các đèn tín hiệu ổn, không có Port bị Down, LCD màu xanh lá"),
      item("ps-2-3", "2.3. Dell EMC S3148 -2", "Các đèn tín hiệu ổn, không có Port bị Down, LCD màu xanh lá"),
      item("ps-2-4", "2.4. Dell EMC S4128F-ON -1", "Các đèn tín hiệu ổn, không có Port bị Down, LCD màu xanh lá"),
      item("ps-2-5", "2.5. Dell EMC S4128F-ON -2", "Các đèn tín hiệu ổn, không có Port bị Down, LCD màu xanh lá"),
    ],
  };
  const g3: ChecklistGroupDef = {
    title: "3. Thiết bị Firewall",
    items: [
      item("ps-3-1", "3.1. Fortigate 200F -1", "Các đèn tín hiệu ổn, không có Port bị Down, LCD màu xanh lá"),
      item("ps-3-2", "3.2. Fortigate 200F -2", "Các đèn tín hiệu ổn, không có Port bị Down, LCD màu xanh lá"),
    ],
  };
  const g4: ChecklistGroupDef = {
    title: "4. Thiết bị Access Point",
    items: [item("ps-4-1", "4.1. Access Point Khu A", "5 AP không bị mất kết nối")],
  };
  const g5: ChecklistGroupDef = {
    title: "5. Thiết bị khác",
    items: [
      item("ps-5-1", "5.1. NAS DS1522+", "Đèn vàng"),
      item("ps-5-2", "5.2. Hệ thống lưu điện Santak -1", "LCD báo trạng thái ổn, không báo lỗi"),
      item("ps-5-3", "5.3. Hệ thống lưu điện Santak -2", "LCD báo trạng thái ổn, không báo lỗi"),
    ],
  };
  const websites: [string, string][] = [
    ["ps-6-1", "6.1. Sinh viên nội trú"],
    ["ps-6-2", "6.2. Quản lý sinh viên"],
    ["ps-6-3", "6.3. Trang chủ trung tâm"],
    ["ps-6-4", "6.4. Thư viện ảnh"],
    ["ps-6-5", "6.5. Không gian văn hóa HCM"],
    ["ps-6-6", "6.6. Thanh tra pháp chế"],
    ["ps-6-7", "6.7. Xác thực thông tin"],
    ["ps-6-8", "6.8. Quản lý tài khoản"],
    ["ps-6-9", "6.9. Quản lý cây xanh"],
    ["ps-6-10", "6.10. Hướng dẫn thông tin"],
    ["ps-6-11", "6.11. Tham quan KTX Online"],
    ["ps-6-12", "6.12. Quản lý tài sản"],
    ["ps-6-13", "6.13. Quản lý nhân sự"],
    ["ps-6-14", "6.14. Quản lý FaceID"],
    ["ps-6-15", "6.15. Báo cáo thông minh"],
  ];
  const g6: ChecklistGroupDef = {
    title: "6. Hệ thống phần mềm website",
    items: websites.map(([k, lbl]) => item(k, lbl, "Hiển thị được nội dung trên website")),
  };
  const g7: ChecklistGroupDef = {
    title: "7. Hệ thống giám sát thiết bị",
    items: [item("ps-7-1", "7. Hệ thống giám sát thiết bị", "Không có thiết bị báo màu đỏ")],
  };
  const g8: ChecklistGroupDef = {
    title: "8. Kiểm tra tốc độ đường truyền mạng",
    items: [
      item("ps-8-1", "8. Kiểm tra tốc độ đường truyền mạng", "Đảm bảo tốc độ đường truyền 300Mbps"),
    ],
  };
  const g9: ChecklistGroupDef = {
    title: "9. Nhiệt độ, độ ẩm phòng máy chủ",
    items: [item("ps-9-1", "9. Nhiệt độ, độ ẩm phòng máy chủ", "Nhiệt độ từ 16-21°C; Độ ẩm < 55%")],
  };
  const g10: ChecklistGroupDef = {
    title: "10. Hệ thống PCCC",
    items: [item("ps-10-1", "10. Hệ thống PCCC", "Đèn báo màu vàng")],
  };
  const g11: ChecklistGroupDef = {
    title: "11. Thiết bị kiểm soát ra vào",
    items: [item("ps-11-1", "11. Thiết bị kiểm soát ra vào", "Phản hồi tốt khi quét")],
  };
  const g12: ChecklistGroupDef = {
    title: "12. Hệ thống camera kiểm soát cổng ra vào",
    items: [item("ps-12-1", "12. Hệ thống camera kiểm soát cổng ra vào", "28 camera không bị mất kết nối")],
  };
  const g13: ChecklistGroupDef = {
    title: "13. Controller Wifi",
    items: [
      item("ps-13-1", "13. Controller Wifi (Aruba)", "Aruba"),
      item("ps-13-2", "13. Controller Wifi (Unifi)", "Unifi"),
    ],
  };
  const g14: ChecklistGroupDef = {
    title: "14. Backup dữ liệu",
    items: [
      item("ps-14-1", "14.1. Server đến Onedrive", "Backup dữ liệu"),
      item("ps-14-2", "14.2. Server đến NAS", "Backup dữ liệu"),
      item("ps-14-3", "14.3. NAS đến HDD Local", "Backup dữ liệu"),
    ],
  };
  return [g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13, g14];
}

export const phongServer: ChecklistDefinition = {
  key: "phong-server",
  title: "Daily checklist phòng server",
  groups: buildPhongServerGroups(),
};
