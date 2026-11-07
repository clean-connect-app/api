export default {
  rules: {
    "types-location": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          location:
            "Объявляйте интерфейсы и типы в каталоге types соответствующего слоя.",
        },
      },
      create(context) {
        if (context.filename.replaceAll("\\", "/").includes("/types/")) {
          return {};
        }
        function report(node) {
          context.report({ node, messageId: "location" });
        }
        return {
          TSInterfaceDeclaration: report,
          TSTypeAliasDeclaration: report,
          TSTypeLiteral: report,
        };
      },
    },
  },
};
