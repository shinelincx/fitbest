import { Table, Typography } from 'antd'
import { roleLabels } from '@/utils/adminPermissions'

const permissions = [
  { role: roleLabels.super, scope: '全平台', access: '账号、组织、门店、数据字典、业务设置、官网编辑与发布' },
  { role: roleLabels.org_admin, scope: '所属组织', access: '本组织门店及下级账号。官网权限由平台管理员授予' },
  { role: roleLabels.gym_admin, scope: '所属门店', access: '门店业务维护。官网权限由平台管理员授予' },
  { role: roleLabels.ops, scope: '分配的门店及业务范围', access: '日常运营。官网权限由平台管理员授予' },
  { role: roleLabels.viewer, scope: '分配的门店及业务范围', access: '查看已授权数据、修改本人密码' },
]

export default function Roles() {
  return (
    <>
      <Typography.Title level={4}>角色权限</Typography.Title>
      <Typography.Paragraph>平台管理员可在管理账号中授予「意见反馈」菜单权限，允许查看和处理三个应用的反馈。</Typography.Paragraph>
      <Table rowKey="role" dataSource={permissions} pagination={false} columns={[
        { title: '角色', dataIndex: 'role' },
        { title: '范围', dataIndex: 'scope' },
        { title: '能力', dataIndex: 'access' },
      ]} />
    </>
  )
}
