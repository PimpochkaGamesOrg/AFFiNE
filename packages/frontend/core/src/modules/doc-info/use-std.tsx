import { useLitPortalFactory } from '@affine/component';
import { getViewManager } from '@affine/core/blocksuite/manager/view';
import {
  patchReferenceRenderer,
  type ReferenceReactRenderer,
} from '@affine/core/blocksuite/view-extensions/editor-view/reference-renderer';
import {
  AffinePageReference,
  AffineSharedPageReference,
} from '@affine/core/components/affine/reference-link';
import { toDocSearchParams } from '@affine/core/modules/navigation';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { DebugLogger } from '@affine/debug';
import { BlockStdScope } from '@blocksuite/affine/std';
import type { Store } from '@blocksuite/affine/store';
import { useServices } from '@toeverything/infra';
import { useMemo } from 'react';

const logger = new DebugLogger('doc-info');

export function useBlockStdScope(doc: Store) {
  const [reactToLit, portals] = useLitPortalFactory();
  const { workspaceService } = useServices({ WorkspaceService });

  const referenceRenderer: ReferenceReactRenderer = useMemo(() => {
    return function customReference(reference) {
      const data = reference.delta.attributes?.reference;
      if (!data) return <span />;

      const pageId = data.pageId;
      if (!pageId) return <span />;

      const params = toDocSearchParams(data.params);
      const title = data.title;

      if (workspaceService.workspace.openOptions.isSharedMode) {
        return (
          <AffineSharedPageReference
            docCollection={workspaceService.workspace.docCollection}
            pageId={pageId}
            params={params}
            title={title}
          />
        );
      }

      return (
        <AffinePageReference pageId={pageId} params={params} title={title} />
      );
    };
  }, [workspaceService]);

  const std = useMemo(() => {
    logger.debug('createBlockStdScope', doc.id);
    const extensions = getViewManager().config.init().value.get('page');
    return new BlockStdScope({
      store: doc,
      extensions: [
        ...extensions,
        patchReferenceRenderer(reactToLit, referenceRenderer),
      ],
    });
  }, [doc, reactToLit, referenceRenderer]);

  return [std, portals] as const;
}
