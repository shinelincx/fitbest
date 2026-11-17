package com.ifitbest.server.module.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import com.ifitbest.server.common.auth.JwtCodec;
import com.ifitbest.server.config.FitbestProperties;
import com.ifitbest.server.infra.persistence.AuditLogRepo;
import com.ifitbest.server.infra.persistence.Device;
import com.ifitbest.server.infra.persistence.DeviceRepo;
import com.ifitbest.server.infra.persistence.DeviceSegmentRepo;
import com.ifitbest.server.infra.persistence.DeviceSession;
import com.ifitbest.server.infra.persistence.DeviceSessionRepo;
import com.ifitbest.server.infra.persistence.EventLink;
import com.ifitbest.server.infra.persistence.EventLinkRepo;
import com.ifitbest.server.infra.persistence.EventRegistrationRepo;
import com.ifitbest.server.infra.persistence.Gym;
import com.ifitbest.server.infra.persistence.GymRepo;
import com.ifitbest.server.infra.persistence.MachineModelRepo;
import com.ifitbest.server.infra.persistence.MachineRepo;
import com.ifitbest.server.infra.persistence.MachineTagRepo;
import com.ifitbest.server.infra.persistence.OrgRepo;
import com.ifitbest.server.infra.persistence.Session;
import com.ifitbest.server.infra.persistence.SessionRepo;
import com.ifitbest.server.infra.persistence.TrainingRecord;
import com.ifitbest.server.infra.persistence.TrainingRecordRepo;
import com.ifitbest.server.infra.persistence.User;
import com.ifitbest.server.infra.persistence.UserGoalRepo;
import com.ifitbest.server.infra.persistence.UserIdentityRepo;
import com.ifitbest.server.infra.persistence.UserRepo;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Root;

class AdminTenantScopeTest {
    private final UUID orgId = UUID.randomUUID();
    private final UUID gymId = UUID.randomUUID();
    private final UUID allowedUser = UUID.randomUUID();
    private final JwtCodec.AdminPayload gymAdmin = admin("gym_admin", gymId);
    private final SessionRepo sessions = mock(SessionRepo.class);
    private final TrainingRecordRepo records = mock(TrainingRecordRepo.class);
    private final DeviceSessionRepo deviceSessions = mock(DeviceSessionRepo.class);
    private final DeviceRepo devices = mock(DeviceRepo.class);
    private final UserRepo users = mock(UserRepo.class);
    private final GymRepo gyms = mock(GymRepo.class);
    private final EventLinkRepo events = mock(EventLinkRepo.class);
    private final EventRegistrationRepo registrations = mock(EventRegistrationRepo.class);
    private final AdminService admin = new AdminService(users, mock(UserIdentityRepo.class), mock(UserGoalRepo.class),
        sessions, mock(MachineRepo.class), mock(MachineModelRepo.class), mock(MachineTagRepo.class), gyms,
        mock(OrgRepo.class), events, registrations, mock(AuditLogRepo.class), records, deviceSessions,
        mock(DeviceSegmentRepo.class), devices, new FitbestProperties());

    @Test
    void trainingRecordSearchForUserOutsideGymReturnsAnEmptyPage() {
        allowUsers(gymId, allowedUser);

        var page = admin.trainingRecords(gymAdmin, "hyrox", UUID.randomUUID().toString(), null, null, null, null, null);

        assertThat(page).containsEntry("total", 0L).containsEntry("items", List.of());
        verifyNoInteractions(records);
    }

    @Test
    void scopedTrainingRecordSearchUsesTheRequestedUserWithinTheGym() {
        allowUsers(gymId, allowedUser, UUID.randomUUID());
        when(records.findAll(any(Specification.class), any(Pageable.class))).thenReturn(Page.empty());

        admin.trainingRecords(gymAdmin, null, allowedUser.toString(), null, null, null, null, null);

        ArgumentCaptor<Specification<TrainingRecord>> spec = ArgumentCaptor.captor();
        verify(records).findAll(spec.capture(), any(Pageable.class));
        Root<TrainingRecord> root = mock(Root.class, RETURNS_DEEP_STUBS);
        spec.getValue().toPredicate(root, null, mock(CriteriaBuilder.class));
        verify(root.get("userId")).in(Set.of(allowedUser));
    }

    @Test
    void deviceSessionsUseAnOrganizationWideUserScopeAndTheResolvedDeviceId() {
        UUID secondGym = UUID.randomUUID();
        UUID secondUser = UUID.randomUUID();
        UUID deviceId = UUID.randomUUID();
        Gym first = new Gym();
        first.setId(gymId);
        Gym second = new Gym();
        second.setId(secondGym);
        when(gyms.findByOrgId(orgId)).thenReturn(List.of(first, second));
        when(sessions.findByGymIdInAndStartedAtGreaterThanEqual(eq(List.of(gymId, secondGym)), any()))
            .thenReturn(List.of(session(allowedUser), session(secondUser)));
        Device device = new Device();
        device.setId(deviceId);
        when(devices.findBySerialNo("TEST-BAND")).thenReturn(Optional.of(device));
        when(deviceSessions.findAll(any(Specification.class), any(Pageable.class))).thenReturn(Page.empty());

        admin.deviceSessions(admin("org_admin", null), null, null, "TEST-BAND", null, null, null, null);

        ArgumentCaptor<Specification<DeviceSession>> spec = ArgumentCaptor.captor();
        verify(deviceSessions).findAll(spec.capture(), any(Pageable.class));
        Root<DeviceSession> root = mock(Root.class, RETURNS_DEEP_STUBS);
        CriteriaBuilder builder = mock(CriteriaBuilder.class);
        spec.getValue().toPredicate(root, null, builder);
        verify(root.get("userId")).in(Set.of(allowedUser, secondUser));
        verify(builder).equal(root.get("deviceId"), deviceId);
    }

    @Test
    void gymWithNoUsersHasNoDeviceSessions() {
        allowUsers(gymId);

        var page = admin.deviceSessions(gymAdmin, null, null, null, null, null, null, null);

        assertThat(page).containsEntry("total", 0L).containsEntry("items", List.of());
        verifyNoInteractions(deviceSessions);
    }

    @Test
    void userDetailsScopeEventRegistrationsBeforePagination() {
        allowUsers(gymId, allowedUser);
        User user = new User();
        user.setId(allowedUser);
        when(users.findById(allowedUser)).thenReturn(Optional.of(user));
        EventLink ownEvent = new EventLink();
        ownEvent.setId(UUID.randomUUID());
        when(events.findByOrgIdOrderBySortAscCreatedAtDesc(orgId)).thenReturn(List.of(ownEvent));

        admin.userDetail(gymAdmin, allowedUser, null);

        verify(registrations).findByUserIdAndEventIdIn(eq(allowedUser), eq(List.of(ownEvent.getId())), any(Pageable.class));
        verify(registrations, never()).findByUserIdOrderByCreatedAtDesc(any(), any());
    }

    @Test
    void superAdminRetainsGlobalDeviceList() {
        when(deviceSessions.findAll(any(Specification.class), any(Pageable.class))).thenReturn(Page.empty());

        admin.deviceSessions(admin("super", null), null, null, null, null, null, null, null);

        ArgumentCaptor<Specification<DeviceSession>> spec = ArgumentCaptor.captor();
        verify(deviceSessions).findAll(spec.capture(), any(Pageable.class));
        Root<DeviceSession> root = mock(Root.class);
        spec.getValue().toPredicate(root, null, mock(CriteriaBuilder.class));
        verifyNoInteractions(root, sessions, gyms);
    }

    private JwtCodec.AdminPayload admin(String role, UUID gym) {
        return new JwtCodec.AdminPayload(UUID.randomUUID().toString(), role, orgId.toString(),
            gym == null ? null : gym.toString());
    }

    private void allowUsers(UUID gym, UUID... userIds) {
        when(sessions.findByGymIdInAndStartedAtGreaterThanEqual(eq(List.of(gym)), any()))
            .thenReturn(List.of(userIds).stream().map(AdminTenantScopeTest::session).toList());
    }

    private static Session session(UUID userId) {
        Session session = new Session();
        session.setUserId(userId);
        return session;
    }
}
