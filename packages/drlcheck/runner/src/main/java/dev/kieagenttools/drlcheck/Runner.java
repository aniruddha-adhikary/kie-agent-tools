package dev.kieagenttools.drlcheck;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.kie.api.KieBase;
import org.kie.api.builder.Message;
import org.kie.api.builder.Results;
import org.kie.api.definition.KiePackage;
import org.kie.api.definition.rule.Rule;
import org.kie.api.definition.type.FactType;
import org.kie.api.event.rule.AfterMatchFiredEvent;
import org.kie.api.event.rule.DefaultAgendaEventListener;
import org.kie.api.io.ResourceType;
import org.kie.api.runtime.KieSession;
import org.kie.internal.utils.KieHelper;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Headless Drools runner invoked by the drlcheck CLI. Commands:
 *   compile <file.drl>...                 -> compilation diagnostics as JSON
 *   describe <file.drl>...                -> rules and declared types as JSON
 *   run <file.drl>... --facts <facts.json> -> fired rules + resulting facts as JSON
 */
public final class Runner {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private Runner() {
    }

    public static void main(String[] args) throws Exception {
        PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        if (args.length < 2) {
            out.println("{\"error\":\"usage: compile|describe|run <file.drl>... [--facts <facts.json>]\"}");
            System.exit(2);
        }
        String command = args[0];
        List<String> drlFiles = new ArrayList<>();
        String factsFile = null;
        for (int i = 1; i < args.length; i++) {
            if ("--facts".equals(args[i]) && i + 1 < args.length) {
                factsFile = args[++i];
            } else {
                drlFiles.add(args[i]);
            }
        }

        KieHelper helper = new KieHelper();
        for (String file : drlFiles) {
            helper.addContent(Files.readString(Path.of(file)), ResourceType.DRL);
        }

        ObjectNode root = MAPPER.createObjectNode();
        ArrayNode diagnostics = root.putArray("diagnostics");
        Results results = helper.verify();
        boolean hasErrors = false;
        for (Message message : results.getMessages()) {
            ObjectNode d = diagnostics.addObject();
            d.put("severity", message.getLevel().toString().toLowerCase());
            d.put("line", message.getLine());
            d.put("column", message.getColumn());
            d.put("message", message.getText());
            if (message.getLevel() == Message.Level.ERROR) {
                hasErrors = true;
            }
        }
        root.put("ok", !hasErrors);

        if (hasErrors || "compile".equals(command)) {
            out.println(MAPPER.writeValueAsString(root));
            System.exit(hasErrors ? 1 : 0);
        }

        KieBase kieBase = helper.build();

        if ("describe".equals(command)) {
            describe(kieBase, root);
            out.println(MAPPER.writeValueAsString(root));
            return;
        }

        if ("run".equals(command)) {
            run(kieBase, factsFile, root);
            out.println(MAPPER.writeValueAsString(root));
            return;
        }

        out.println("{\"error\":\"unknown command: " + command + "\"}");
        System.exit(2);
    }

    private static void describe(KieBase kieBase, ObjectNode root) {
        ArrayNode rules = root.putArray("rules");
        ArrayNode types = root.putArray("declaredTypes");
        for (KiePackage pkg : kieBase.getKiePackages()) {
            for (Rule rule : pkg.getRules()) {
                ObjectNode r = rules.addObject();
                r.put("name", rule.getName());
                r.put("package", rule.getPackageName());
                ObjectNode meta = r.putObject("metadata");
                for (Map.Entry<String, Object> entry : rule.getMetaData().entrySet()) {
                    meta.put(entry.getKey(), String.valueOf(entry.getValue()));
                }
            }
            for (FactType factType : pkg.getFactTypes()) {
                ObjectNode t = types.addObject();
                t.put("name", factType.getName());
                ArrayNode fields = t.putArray("fields");
                factType.getFields().forEach(f -> {
                    ObjectNode field = fields.addObject();
                    field.put("name", f.getName());
                    field.put("type", f.getType().getName());
                });
            }
        }
    }

    private static void run(KieBase kieBase, String factsFile, ObjectNode root) throws Exception {
        List<Map<String, Object>> factSpecs = new ArrayList<>();
        if (factsFile != null) {
            JsonNode parsed = MAPPER.readTree(Files.readString(Path.of(factsFile)));
            if (!parsed.isArray()) {
                throw new IllegalArgumentException("facts JSON must be an array of {type, data} objects");
            }
            for (JsonNode node : parsed) {
                Map<String, Object> spec = new LinkedHashMap<>();
                spec.put("type", node.path("type").asText());
                spec.put("data", MAPPER.convertValue(node.path("data"), Map.class));
                factSpecs.add(spec);
            }
        }

        KieSession session = kieBase.newKieSession();
        try {
            for (Map<String, Object> spec : factSpecs) {
                String typeName = (String) spec.get("type");
                FactType factType = resolveFactType(kieBase, typeName);
                Object instance = factType.newInstance();
                @SuppressWarnings("unchecked")
                Map<String, Object> data = (Map<String, Object>) spec.get("data");
                factType.setFromMap(instance, data);
                session.insert(instance);
            }

            ArrayNode fired = root.putArray("fired");
            session.addEventListener(new DefaultAgendaEventListener() {
                @Override
                public void afterMatchFired(AfterMatchFiredEvent event) {
                    ObjectNode f = fired.addObject();
                    f.put("rule", event.getMatch().getRule().getName());
                    f.put("package", event.getMatch().getRule().getPackageName());
                }
            });
            int count = session.fireAllRules();
            root.put("firedCount", count);

            ArrayNode factsAfter = root.putArray("factsAfter");
            for (Object object : session.getObjects()) {
                ObjectNode f = factsAfter.addObject();
                f.put("type", object.getClass().getName());
                FactType factType = resolveFactTypeByClass(kieBase, object.getClass().getName());
                if (factType != null) {
                    f.set("data", MAPPER.valueToTree(factType.getAsMap(object)));
                } else {
                    f.put("data", object.toString());
                }
            }
        } finally {
            session.dispose();
        }
    }

    private static FactType resolveFactType(KieBase kieBase, String typeName) {
        List<String> known = new ArrayList<>();
        for (KiePackage pkg : kieBase.getKiePackages()) {
            for (FactType factType : pkg.getFactTypes()) {
                known.add(factType.getName());
                if (factType.getName().equals(typeName) || factType.getSimpleName().equals(typeName)) {
                    return factType;
                }
            }
        }
        throw new IllegalArgumentException(
                "unknown fact type \"" + typeName + "\"; declared types: " + String.join(", ", known));
    }

    private static FactType resolveFactTypeByClass(KieBase kieBase, String className) {
        for (KiePackage pkg : kieBase.getKiePackages()) {
            for (FactType factType : pkg.getFactTypes()) {
                if (factType.getName().equals(className)) {
                    return factType;
                }
            }
        }
        return null;
    }
}
