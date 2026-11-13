# Graph reliability — extractor 0.1.1

Correções motivadas pelo relato do GrupoSonda.Legado (`05dc192`, extrator
`dotnet-ast` 0.1.0). O checkout e o artefato originais do Legado não foram
reprocessados nesta entrega; os cenários foram reproduzidos com fontes pequenas
no seam público `CodeGraph`.

## Resultado

| Relato | Comportamento implementado | Regressões |
| --- | --- | --- |
| Homônimos confirmados por nome | C# resolve tipos lexicais, DI e retornos conhecidos; TS usa declarações do checker; PHP resolve casos simples tipados. Demais candidatos são `AMBIGUOUS`. | `tests/codegraph/dotnet-resolution.test.ts`, `cross-language-resolution.test.ts` |
| Métodos privados locais ausentes | `M()` e `this.M()` resolvem o membro da própria classe; corpos são localizados pela declaração, não pela primeira ocorrência do nome. | `dotnet-resolution.test.ts` |
| Lambdas/delegates como métodos | Apenas membros imediatos da classe/interface viram nós. Chamadas em lambdas e funções locais pertencem ao método contêiner. | `dotnet-resolution.test.ts` |
| Imports inventados por namespace | Expansão conservadora de namespace continua disponível, com `INFERRED` em vez de `EXTRACTED`. | `dotnet-resolution.test.ts` |
| Respostas sem limite | `queryGraph`/MCP limitam cada array a 25 itens por padrão, máximo 100; cursor permite recuperar as páginas restantes. | `query-pagination.test.ts` |

As regressões adicionais cobrem sombreamento de campos por parâmetros/variáveis,
chamadas encadeadas não suportadas, records sem corpo e colisões dos IDs v1.
O extrator C# elimina nós e arestas idênticos antes de publicar o documento.
Isso não estabelece a causa das duplicações específicas relatadas nos testes do
Legado, que permanecem sem revalidação.

## Compatibilidade e migração

- `schemaVersion: 1` e IDs canônicos permanecem iguais. IDs homônimos no mesmo
  arquivo ainda são uma representação com perda; chamadas envolvendo essas
  colisões não recebem confirmação arbitrária.
- Os três extratores passam de `0.1.0` para `0.1.1`. Freshness compara também
  identidade e versão: reconstrua artefatos antigos com `cg_generate_graph`.
- `EXTRACTED` deixa de ser emitido apenas por coincidência de nomes. Consumidores
  que filtram só essa proveniência verão menos resultados; candidatos incertos
  permanecem consultáveis pelos filtros existentes.
- A paginação adiciona `payload.page`. Clientes que precisam da lista completa
  devem seguir `nextCursor` com a mesma pergunta; a omissão de `limit` também
  aplica o novo limite padrão. Reconstruções invalidam o cursor.
- Para reverter a versão do servidor, regenere o artefato com o extrator dessa
  versão e reinicie consultas paginadas. Nenhuma migration de dados é necessária.

## Limites

C# e PHP continuam scans estruturais, não compiladores completos. Aliases,
herança, extensions, múltiplos namespaces por arquivo e expressões complexas não
têm resolução semântica completa. Implementações de interface não são escolhidas
por suposição sobre o container de DI. Veja
[tools.md](../../.agents/skills/nero-code-graph/tools.md) para a política de
proveniência, paginação e navegação classe → método → chamada.

O checker TypeScript usa opções padrão conservadoras, sem carregar o tsconfig
consumidor. Ele pode custar mais no rebuild do que a passagem sintática anterior;
não foi feito benchmark em um repositório de produção.

## Evidência de validação

- Baseline: 51 testes aprovados antes das alterações.
- Final: `npm test` — 79 testes aprovados em 14 arquivos.
- `npm run typecheck` e `npm run build` aprovados.
- `git diff --check` aprovado. O repositório não define comando de lint.
- Revisões separadas de Standards e Spec concluídas, com os achados reproduzidos
  e corrigidos. Nenhuma dependência, migration, CI/CD ou configuração do Legado
  foi alterada.

Não foi feito smoke com cliente stdio nem validação visual. A fronteira MCP foi
validada pelos testes de host e schema; o uso no checkout real do Legado requer
rebuild e conferência dos destinos relatados.
