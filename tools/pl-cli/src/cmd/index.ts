// Command index for oclif. Run `pnpm run oclif:index` to regenerate.

import ProjectList from "./project/list";
import ProjectInfo from "./project/info";
import ProjectDuplicate from "./project/duplicate";
import ProjectRename from "./project/rename";
import ProjectDelete from "./project/delete";
import AdminCopyProject from "./admin/copy-project";
import AdminUserList from "./admin/user-list";

export const COMMANDS = {
  "project:list": ProjectList,
  "project:info": ProjectInfo,
  "project:duplicate": ProjectDuplicate,
  "project:rename": ProjectRename,
  "project:delete": ProjectDelete,
  "admin:copy-project": AdminCopyProject,
  "admin:user-list": AdminUserList,
};
