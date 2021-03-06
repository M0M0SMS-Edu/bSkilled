import Vue from 'vue';
import Vuex from 'vuex';
import uuidv1 from 'uuid/v1';

import jws from "jws";
import forge from "node-forge";
import pngExtract from "png-chunks-extract";
import pngEncode from "png-chunks-encode";
import pngText from "png-chunk-text";
const pki = forge.pki;

import router from '../router';

Vue.use(Vuex);

const state = {
  // General

  // sharing / signing
  flowMode: "sharing",
  // sharing: search, recipient, share
  // signing: sign, upload, generate, profile, confirmation, signed
  currentFlowStep: "search",
  currentProcess: "sharing",
  badge: undefined,

  // Sharing
  badgeTemplate: undefined,
  recipient: undefined,
  share: undefined,

  // Signing
  keyForge: undefined,
  implication: undefined,
  assertion: undefined,
  signedAssertion: undefined,
  badge: undefined,

};

// General
const SET_CURRENT_FLOW_STEP = "SET_CURRENT_FLOW_STEP";
const SET_FLOW_MODE = "SET_FLOW_MODE";

// Creation
const SAVE_BADGE_TEMPLATE = "SAVE_BADGE_TEMPLATE";
const SAVE_RECIPIENT = "SAVE_RECIPIENT";
const SAVE_SHARE = "SAVE_SHARE";

// Signing
const SAVE_IMPLICATION = "SAVE_IMPLICATION";
const SAVE_KEY = "SAVE_KEY";
const SAVE_PROFILE = "SAVE_PROFILE";
const SAVE_ASSERTION = "SAVE_ASSERTION";
const SAVE_SIGNED_ASSERTION = "SAVE_SIGNED_ASSERTION";
const SAVE_BADGE = "SAVE_BAKED_BADGE";


const mutations = {
  // General
  [SET_CURRENT_FLOW_STEP](state, currentFlowStep, currentProcess) {
    state.currentFlowStep = currentFlowStep;
  },
  [SET_FLOW_MODE](state, flowMode) {
    state.flowMode = flowMode;
  },
  // Creating
  [SAVE_BADGE_TEMPLATE](state, badgeTemplate) {
    state.badgeTemplate = badgeTemplate;
  },
  [SAVE_RECIPIENT](state, recipient) {
    state.recipient = recipient;
  },
  [SAVE_SHARE](state, share) {
    state.share = share;
  },
  // Signing
  [SAVE_IMPLICATION](state, implication) {
    state.implication = implication;
  },
  [SAVE_KEY](state, { keyForge, pem, fingerprint, pubKey }) {
    state.key = { keyForge, pem, fingerprint, pubKey }
  },
  [SAVE_PROFILE](state, profile) {
    state.profile = profile;
  },
  [SAVE_ASSERTION](state, assertion) {
    state.assertion = assertion;
  },
  [SAVE_SIGNED_ASSERTION](state, signedAssertion) {
    state.signedAssertion = signedAssertion;
  },
  [SAVE_BADGE](state, badge) {
    state.badge = badge;
  }
};

const actions = {
  // General
  stepFlow({ commit, state }) {
    const steps = {
      'sharing': {
        'search': (state) => ({
          nextFlowStep: 'recipient',
          nextRoute: { name: 'recipient' }
        }),
        'recipient': (state) => ({
          nextFlowStep: 'share',
          nextRoute: { name: 'share', params: { sid: state.share.sid } }
        })
      },
      'signing': {
        'sign': (state) => ({
          nextFlowStep: 'upload',
          nextRoute: { name: 'upload' }
        }),
        'upload': (state) => ({
          nextFlowStep: 'profile',
          nextRoute: { name: 'profile', }
        }),
        'profile': (state) => ({
          nextFlowStep: 'confirm',
          nextRoute: { name: 'confirm' }
        }),
        'confirm': (state) => ({
          nextFlowStep: 'download',
          nextRoute: { name: 'download' }
        })
      }
    };
    const next = steps[state.flowMode][state.currentFlowStep](state);
    state.currentProcess = state.flowMode
    commit(SET_CURRENT_FLOW_STEP, next.nextFlowStep);
    router.push(next.nextRoute);
  },
  // Sharing
  createImplication({ commit, state }, recipient) {
    console.log(`Submitting badge for ${recipient}`);
    const badgeTemplate = state.badgeTemplate;
    const implication = { recipient, badgeTemplate };
    commit(SAVE_RECIPIENT, recipient);
    return Vue.http
      .post(process.env.API + "implication", implication)
      .then(resp => resp.body)
      .then(share => this.commit(SAVE_SHARE, share));
  },
  // Signing
  prepareSigning({ commit }, sid) {
    commit(SET_FLOW_MODE, "signing");
    commit(SET_CURRENT_FLOW_STEP, "sign");
    console.log("Fetching implication", sid);
    Vue.http
      .get(`${process.env.API}share/${sid}`)
      .then(resp => resp.body)
      .then(implication => commit(SAVE_IMPLICATION, implication))
      .catch(err => console.log(err));
  },
  handleKeyForge({ commit }, keyForge) {
    const pubKeyForge = pki.setRsaPublicKey(
      keyForge.n,
      keyForge.e
    );
    const pubKey = pki.publicKeyToPem(pubKeyForge);
    const pem = pki.privateKeyToPem(keyForge);
    const fingerprintRaw = pki.getPublicKeyFingerprint(pubKeyForge);
    const fingerprint = Buffer.from(fingerprintRaw.data).toString("base64");
    commit(SAVE_KEY, { keyForge, pem, fingerprint, pubKey });

    console.log("Looking for profile at: " + fingerprint);
    var profile = {};
    return Vue.http.get(process.env.API + "profile" + "/" + fingerprint).then(
      resp => {
        if (resp.body.id === undefined) {
          console.log("profile not found commiting empty profile ");
          profile.id = "urn:uuid:" + uuidv1();
          profile.publicKey = {
            "type": "CryptographicKey",
            "id": "urn:uuid:" + uuidv1(),
            "owner": profile.id,
            "publicKeyPem": state.key.pubKey
          };
          profile.type = "Issuer";
          console.log(profile);
          commit(SAVE_PROFILE, profile);
        } else {
          console.log("profile found");
          profile = resp.body;
          console.log("commiting profile as: " + profile);
          commit(SAVE_PROFILE, profile);
        }
      },
      err => {
        console.log(err);
      }
    );

  },
  handleProfile({ commit }, profile) {
    console.log("profile posting");
    console.log(profile);
    commit(SAVE_PROFILE, profile);

    let actualProfile = Object.assign({}, profile);
    actualProfile.fingerprint = state.key.fingerprint;
    console.log(state.key.fingerprint);
    console.log(actualProfile);
    console.log(`Submitting profile at ${actualProfile.fingerprint}`);
    Vue.http.post(process.env.API + "profile", actualProfile).then(
      resp => {
        console.log(resp);
      },
      err => {
        console.log(err);
        alert("Oops! there was an issue uploading your profile: " + err);
      });
  },
  signBadge({ dispatch, commit }) {
    return Promise
      .resolve(dispatch('createSignedBadge'))
      .then((assertion) => {
        commit(SAVE_ASSERTION, assertion);
        const signedAssertion = jws.sign({
          header: { alg: "RS256" },
          privateKey: this.state.key.pem,
          payload: assertion
        });
        commit(SAVE_SIGNED_ASSERTION, signedAssertion);
      });
  },
  bakeBadge({ state, dispatch }) {
    const signedAssertion = state.signedAssertion;
    const sourceImgUrl = state.implication.badgeTemplate.image;
    const sid = state.implication.sid;

    return dispatch('urlToBuffer', sourceImgUrl)
      .then((buffer) => {
        var chunks = pngExtract(buffer);
        chunks.splice(-1, 0, pngText.encode("openbadges", signedAssertion));
        const bakedImgBuffer = new Buffer(pngEncode(chunks));
        const base64img = btoa(String.fromCharCode.apply(null, bakedImgBuffer));
        // "data:image/png;base64," + base64Data;
        return base64img;
      }).then((imageBase64) => {
        const req = { signedAssertion, sourceImgUrl, imageBase64 };
        return Vue.http.patch(`${process.env.API}share/${sid}`, req);
      });
  },
  urlToBuffer({}, url) {
    return Vue.http.get(`${process.env.API}proxy/${btoa(url)}}`, { responseType: "blob" })
      .then((resp) => resp.blob())
      .then((blob) => {
        return new Promise((resolve, reject) => {
          try {
            const fileReader = new FileReader();
            fileReader.onload = (ev) => {
              const arrayBuffer = ev.target.result;
              const buffer = Buffer.from(arrayBuffer);
              resolve(buffer);
            };
            fileReader.readAsArrayBuffer(blob);
          } catch (err) { reject(err); }
        })
      })
      .then((arrayBuffer) => Buffer.from(arrayBuffer));
  },
  createSignedBadge() {
    const implication = state.implication;
    const badgeTemplate = implication.badgeTemplate;
    const profile = state.profile;

    const issuer = { type: 'Profile', ...profile };
    const badge = { type: "BadgeClass", ...badgeTemplate, issuer };
    const recipient = { type: 'email', hashed: false, identity: implication.recipient };
    // TODO: Check badge compliance
    const verification = { type: 'SignedBadge', creator: profile.publicKey };
    const issuedOn = new Date(Date.now()).toISOString();

    return {
      "@context": "https://w3id.org/openbadges/v2",
      type: "Assertion",
      id: `urn:uuid:${uuidv1()}`,
      badge,
      recipient,
      issuedOn,
      verification,
    };
  },
  fetchBadge({ commit }, sid) {
    Vue.http
      .get(`${process.env.API}share/${sid}`)
      .then(resp => resp.body)
      .then(badge => commit(SAVE_BADGE, badge))
      .catch(err => console.log(err));
  }
};

const getters = {};

export default new Vuex.Store({ state, getters, mutations, actions });
