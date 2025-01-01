import { wrapFunction } from 'markmap-common';
import { ITransformHooks } from 'markmap-lib';
import { definePlugin } from 'markmap-lib/plugins';

const name = 'localImage';

export default function plugin(resolveUrl: (url: string) => string) {
  return definePlugin({
    name,
    transform(transformHooks: ITransformHooks) {
      transformHooks.parser.tap((md) => {
        md.renderer.renderAttrs = wrapFunction(
          md.renderer.renderAttrs,
          (renderAttrs, token) => {
            if (token.tag === 'img') {
              const src = token.attrGet('src');
              if (src && !/^[\w-]+:/.test(src)) {
                token.attrSet('src', resolveUrl(src));
              }
            }
            return renderAttrs(token);
          },
        );
      });
      return {};
    },
  });
}
