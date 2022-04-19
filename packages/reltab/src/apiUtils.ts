import { getConnection } from "./remote/server";
import { DataSourceNode, DataSourcePath } from "./DataSource";
import { ReltabConnection } from "./reltab";

export async function resolvePath(
  rtc: ReltabConnection,
  dsPath: DataSourcePath
): Promise<DataSourceNode> {
  const { sourceId, path } = dsPath;
  const conn = await rtc.connect(sourceId);
  let node: DataSourceNode;
  if (path.length < 2) {
    node = await conn.getRootNode();
  } else {
    // This is awkward and weird, and suggests DataSource.getChildren() should take
    // a node, not a path...
    const childId = path[path.length - 1];
    const parentDSPath = { sourceId, path: path.slice(0, path.length - 1) };
    let parentChildren = await conn.getChildren(parentDSPath);
    const childNode = parentChildren.find((elem) => elem.id === childId);
    if (childNode !== undefined) {
      node = childNode;
    } else {
      throw new Error(
        "could not resolve data source path " +
          JSON.stringify(dsPath) +
          ": object not found"
      );
    }
  }
  return node;
}
