package com.ifitbest.server.module.machine;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.QrTokens;
import com.ifitbest.server.config.FitbestProperties;
import com.ifitbest.server.infra.persistence.Gym;
import com.ifitbest.server.infra.persistence.GymRepo;
import com.ifitbest.server.infra.persistence.Machine;
import com.ifitbest.server.infra.persistence.MachineRepo;
import com.ifitbest.server.infra.persistence.MachineStatus;
import com.ifitbest.server.infra.persistence.MachineTag;
import com.ifitbest.server.infra.persistence.MachineTagRepo;
import com.ifitbest.server.infra.persistence.TagStatus;
import com.ifitbest.server.infra.persistence.TagType;
import com.ifitbest.server.infra.persistence.MachineModel;
import com.ifitbest.server.infra.persistence.MachineModelRepo;

/** 器械服务 —— 列表 + 扫码解析（HMAC 防伪 QR / NFC 标签 / 序列号兜底），契约一致 */
@Service
public class MachinesService {

    private final MachineRepo machines;
    private final MachineModelRepo models;
    private final GymRepo gyms;
    private final MachineTagRepo tags;
    private final FitbestProperties props;

    public MachinesService(MachineRepo machines, MachineModelRepo models, GymRepo gyms,
                           MachineTagRepo tags, FitbestProperties props) {
        this.machines = machines;
        this.models = models;
        this.gyms = gyms;
        this.tags = tags;
        this.props = props;
    }

    public record MachineView(String id, String type, String model, String brand, String name,
                              String serialNo, String status, String gymId, String gymName) {

        static MachineView of(Machine machine, MachineModel model, String gymName) {
            String name = (model.getBrand() != null ? model.getBrand() + " " : "") + model.getModel();
            return new MachineView(machine.getId().toString(), model.getType().name(), model.getModel(),
                model.getBrand(), name, machine.getSerialNo(), machine.getStatus().name(),
                machine.getGymId().toString(), gymName);
        }
    }

    public java.util.List<Map<String, Object>> list(String gymId) {
        java.util.List<Machine> rows = gymId != null && !gymId.isBlank()
            ? machines.findByStatusAndGymIdOrderByCreatedAtAsc(MachineStatus.active, UUID.fromString(gymId))
            : machines.findByStatusOrderByCreatedAtAsc(MachineStatus.active);

        Map<UUID, String> modelMap = new java.util.HashMap<>();
        Map<UUID, MachineModel> modelById = new java.util.HashMap<>();
        for (MachineModel model : models.findAll()) {
            modelById.put(model.getId(), model);
        }
        Map<UUID, String> gymNames = new java.util.HashMap<>();
        for (Gym gym : gyms.findAll()) {
            gymNames.put(gym.getId(), gym.getName());
        }

        return rows.stream()
            .filter(m -> modelById.containsKey(m.getModelId()))
            .map(m -> {
                MachineModel model = modelById.get(m.getModelId());
                MachineView view = MachineView.of(m, model, gymNames.get(m.getGymId()));
                Map<String, Object> out = new LinkedHashMap<String, Object>();
                out.put("id", view.id());
                out.put("type", view.type());
                out.put("model", view.model());
                out.put("brand", view.brand());
                out.put("name", view.name());
                out.put("serialNo", view.serialNo());
                out.put("status", view.status());
                out.put("gymId", view.gymId());
                out.put("gymName", view.gymName());
                return out;
            })
            .toList();
    }

    public Map<String, Object> resolve(String kind, String value) {
        UUID machineId = null;

        if ("qr".equals(kind)) {
            String parsed = QrTokens.parseQrValue(value, props.getQr().getSecret());
            machineId = parsed != null ? UUID.fromString(parsed) : machineIdFromTag(value, TagType.qr);
        } else {
            machineId = machineIdFromTag(value, TagType.nfc);
            if (machineId == null) {
                String parsed = QrTokens.parseQrValue(value, props.getQr().getSecret());
                machineId = parsed != null ? UUID.fromString(parsed) : null;
            }
            if (machineId == null) {
                machineId = machines.findBySerialNo(value).map(Machine::getId).orElse(null);
            }
        }

        if (machineId == null) {
            throw BizException.notFound("未识别到器械，请重新扫码或贴卡");
        }

        Machine machine = machines.findById(machineId).orElse(null);
        if (machine == null) {
            throw BizException.notFound("未找到该器械，请联系门店工作人员");
        }
        if (machine.getStatus() != MachineStatus.active) {
            throw BizException.badRequest("该设备维护中，请更换其他器械");
        }

        MachineModel model = models.findById(machine.getModelId()).orElseThrow();
        String gymName = gyms.findById(machine.getGymId()).map(Gym::getName).orElse(null);
        MachineView view = MachineView.of(machine, model, gymName);
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("id", view.id());
        out.put("type", view.type());
        out.put("model", view.model());
        out.put("brand", view.brand());
        out.put("name", view.name());
        out.put("serialNo", view.serialNo());
        out.put("status", view.status());
        out.put("gymId", view.gymId());
        out.put("gymName", view.gymName());
        return Map.of("machine", out);
    }

    private UUID machineIdFromTag(String value, TagType tagType) {
        Optional<MachineTag> tag = tags.findByTagValue(value);
        return tag
            .filter(t -> t.getTagType() == tagType && t.getStatus() == TagStatus.active)
            .map(MachineTag::getMachineId)
            .orElse(null);
    }
}
