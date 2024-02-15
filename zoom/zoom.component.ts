import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener,
  NgZone,
  OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NbDialogService } from '@nebular/theme';
import { TranslateService } from '@ngx-translate/core';
import ZoomVideo, {
  ActiveSpeaker,
  CaptureVideoOption,
  ExecutedFailure,
  ExecutedResult,
  LiveTranscriptionClient,
  LiveTranscriptionLanguage,
  LiveTranscriptionMessage,
  LiveTranscriptionStatus,
  MediaCompatiblity,
  MediaDevice,
  Participant,
  ParticipantPropertiesPayload,
  Stream,
  UnderlyingColor,
  VideoActiveState,
  VideoCapturingState,
  VideoClient,
  VideoQuality
} from '@zoom/videosdk';
import { ClinicService } from 'src/app/shared/service/clinic.service';
import { DataService } from 'src/app/shared/service/data.service';
import { LanguageService } from 'src/app/shared/service/language.service';
import { ProfileService } from 'src/app/shared/service/profile.service';
import { ZoomMeetService } from 'src/app/zoom-meet/zoom-helper/zoom-meet.service';
import { Location } from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, first } from 'rxjs/operators';
import { lOADINGSCREENSTATE, zoomBlur } from '../src/app/zoom-meet/zoom-helper/zoom-fix';
import {
  OrderParticipantForMobilePosition,
  ParticipantsTopPosition,
  SingleParticipantPosition,
  USERIN,
  USERPOSITION,
  VideoCanvasSize,
  ScreenShareSize,
  Area,
  SpeakerInfoSize,
  CurrentSpeakerInfoSize,
  CurrentParticipantsName,
  SelfVideoElementSize,
  MEETINGLAYOUTSTATE,
  UserTopLocalState,
  UserTopBox,
  ViewSize,
  UserAspectRatio,
  FromMobileAspectRatio,
  CaptionSelectedResponse,
  ZoomSharorScreenChange,
  OrderParticipantForWebPosition,
  ForwebUserLocalState,
  CurrentButtonPosition
} from '../src/app/zoom-meet/zoom-helper/zoom-interface';
import { InviteComponent } from '../src/app/zoom-meet/invite/invite.component';
import { environment } from 'src/environments/environment';
import { InterpreterComponent } from '../src/app/zoom-meet/interpreter/interpreter.component';
import { CaptionLanguageComponent } from '../src/app/zoom-meet/caption-language/caption-language.component';
import { ROUTEPATH } from 'src/app/shared/enums/project.enum';
import { ParticipantNameComponent } from '../src/app/zoom-meet/participant-name/participant-name.component';
import { FooterComponent } from '../src/app/zoom-meet/footer/footer.component';

let upperPortionHeightInPixel = 130; // that means 3 cm i taken from the zoom meeting reference
let upperPortionWidthInPixel = Math.ceil((upperPortionHeightInPixel / 9) * 16); // calculated the 16:9 ratio from the height
const gapBetweenTile = 3;
@Component({
  selector: 'app-zoom',
  templateUrl: './zoom.component.html',
  styleUrls: ['./zoom.component.scss'],
  providers: [ZoomMeetService],
})
export class ZoomComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(FooterComponent) footerComponentInstane: FooterComponent;
  @ViewChild('videoElementRef') set videoElementRefElem(value: ElementRef<HTMLVideoElement>) {
    this._videoElementRef = value;
  }
  get videoElementRefElem() {
    return this._videoElementRef;
  }
  // tslint:disable-next-line:variable-name
  private _videoElementRef: ElementRef<HTMLVideoElement>;

  @ViewChild('particpantsVideoCanvas') set particpantsVideoCanvasElem(value: ElementRef<HTMLCanvasElement>) {
    this._particpantsVideoCanvasElem = value;
  }
  get particpantsVideoCanvasElem() {
    return this._particpantsVideoCanvasElem;
  }
  // tslint:disable-next-line:variable-name
  private _particpantsVideoCanvasElem: ElementRef<HTMLCanvasElement>;

  @ViewChild('shareScreenSelfVideoElement') set videoSelfElementRefElem(value: ElementRef<HTMLVideoElement>) {
    this._videoSelfElementRefElem = value;
  }
  get videoSelfElementRefElem() {
    return this._videoSelfElementRefElem;
  }
  // tslint:disable-next-line:variable-name
  private _videoSelfElementRefElem: ElementRef<HTMLVideoElement>;

  @ViewChild('shareScreenSelfCanvasElement') set selfScreenShareCanvasElemRef(value: ElementRef<HTMLCanvasElement>) {
    this._selfScreenShareCanvasElemRef = value;
  }
  get selfScreenShareCanvasElemRef() {
    return this._selfScreenShareCanvasElemRef;
  }
  // tslint:disable-next-line:variable-name
  private _selfScreenShareCanvasElemRef: ElementRef<HTMLCanvasElement>;

  @ViewChild('screenShareContentRender') set screenShareContentRender(value: ElementRef<HTMLCanvasElement>) {
    this._screenShareContentRender = value;
  }
  get screenShareContentRender() {
    return this._screenShareContentRender;
  }
  // tslint:disable-next-line:variable-name
  private _screenShareContentRender: ElementRef<HTMLCanvasElement>;

  client: typeof VideoClient;
  stream: typeof Stream;

  permissionError = false;
  isInVBMode = false;
  renderSelfInVideoEl = false;
  renderScreenShareSelfVedioEl = false;

  containerHeight: number;
  containerWidth: number;

  defaultScreenShareContainer = 0;

  deviceCompactbiliy: MediaCompatiblity;


  imagerUrl: string;

  currentSelfParticipant: Participant;

  currentUserPosition = {
    width: 0,
    height: 0,
    x: 0,
    y: 0,
  };

  usersLists: Participant[] = [];

  windowResizer$ = new Subject();

  closedCaptions$ = new Subject<LiveTranscriptionMessage>();

  activeSpeaker$ = new Subject<ActiveSpeaker>();

  loadingScreen = {
    show: true,
    message: 'Join meeting',
    state: lOADINGSCREENSTATE.JOIN
  };

  captionEnabled = false;
  captionLanguage = {
    speaking: LiveTranscriptionLanguage.English,
    translate: LiveTranscriptionLanguage.Persian,
  };
  isHost = true;

  footerIntervalId: NodeJS.Timeout;

  showFooter = false;

  speakerCurrentUserRendering: USERIN;

  topPositionUsers: Participant[] = [];
  topPositionUsersId: number[] = [];
  stopRenderparticipantsLists: number[] = [];

  userToRender: number[] = [];

  rerenderInitiated = false;

  layoutNumber: number;
  usersPerTopLayout: number;
  userIdWithLayout: USERPOSITION;

  // fortoken generation
  meetingID: string;
  userIdentityName: string;

  // for screenshare layout
  isScreenSomeOneSharing = false;
  screenShareData = {
    name: '',
    userID: 0
  };
  selfScreenShareLayout = {
    start: false,
    paused: false
  };

  showNavigationButtons = false;
  multipleUserInMeeting = false;
  startedCaptionService = false;
  triggerOnlyFirstTime = true;
  videoCanvasSize: VideoCanvasSize;
  screenShareSize: ScreenShareSize;
  participantTopForWeb: ParticipantsTopPosition;
  currentParticipantsTopForWeb: OrderParticipantForWebPosition;
  currentParticipantsTopForMobile: OrderParticipantForMobilePosition;
  currentButtonPosition: CurrentButtonPosition;
  speakerInfoSize: SpeakerInfoSize;
  currentVideoCanvasSize: Area;
  currentSpeakerSize: CurrentSpeakerInfoSize;
  speakerBottomPosition = 0;
  footerHeight = 52;
  footerTranslateHeight = 0;
  currentLayoutViewNumber = 1;
  currentActiveSpeakerResponse = {
    videoOff: true
  };
  currentParticipantsName: CurrentParticipantsName = {
    top: '',
    speaker: ''
  };
  selfVideoElementSize: SelfVideoElementSize = {
    height: 0,
    width: 0,
    x: 0,
    y: 0,
    hide: true
  };

  topBoxContainer: UserTopBox = {
    x: 0,
    hide: true,
    id: 1,
    width: 0,
    height: 0,
    videoOff: false
  };

  /**
   * @description holding the current view page number
   */
  currentPage = 1;
  /**
   * @description holding the state of total page
   */
  totalPage = 0;
  /**
   * @description holding the previous state of total page
   */
  previousTotalPage = 0;

  screenShare = {
    show: false,
    x: 0,
    y: 0,
    paused: false,
    expanded: true
  };
  usersAspectRatioMaintain: { [userId: number]: FromMobileAspectRatio } = {};

  mobileAndTablet = false;

  singleUserState: UserTopLocalState;

  forWebUserLocalState: ForwebUserLocalState[] = [];
  layoutState: MEETINGLAYOUTSTATE;


  liveTranscriptionTranslation: typeof LiveTranscriptionClient;

  translationStatus: LiveTranscriptionStatus;

  version: string = environment.version;

  recipientName: string;

  constructor(
    private dialogService: NbDialogService,
    private zms: ZoomMeetService,
    private translate: TranslateService,
    private languageService: LanguageService,
    private cs: ClinicService,
    private ps: ProfileService,
    private router: Router,
    private location: Location,
    private dataService: DataService,
    private el: ElementRef,
    private activeRoute: ActivatedRoute,
    private cd: ChangeDetectorRef,
    private zone: NgZone,
  ) {
    translate.use('en');
    translate.setTranslation('en', this.languageService.state);
  }
  ngOnInit() {

    if (this.dataService.mobileAndTabletCheck()) {
      this.footerHeight = 150;
      this.mobileAndTablet = true;
    }
    this.calculateLayout();

    this.handleFooter();

    this.deviceCompactbiliy = ZoomVideo.checkSystemRequirements();

    // resize to render particular aspect for performance need to wait for resize is done
    this.windowResizer$.pipe(
      distinctUntilChanged(),
      debounceTime(250),
    ).subscribe((resizeValue) => {
      this.adjustLayout();
    });

    // active speaker next speaker continuous speaker for 250s it will render until other speaker joins
    this.activeSpeaker$.pipe(
      debounceTime(3000),
      distinctUntilChanged((x, y) => JSON.stringify(x) === JSON.stringify(y)),
    ).subscribe((activeSpeaker) => {
      this.renderCurrentSpeaker(activeSpeaker);
    });

    // this will trigger after the join meeting done and video or audio started emitted from the footer component
    this.zms.proceedFurtherOb.subscribe((res) => {
      this.placeParticipantsInFrame();
    });

    this.meetingID = this.activeRoute.parent.snapshot.params.meetingID;

    this.recipientName = this.activeRoute.parent.snapshot.queryParams.recipientName;

  }


  @HostListener('mousemove', ['$event'])
  @HostListener('mousedown', ['$event'])
  @HostListener('mouseenter', ['$event'])
  @HostListener('mouseleave', ['$event'])
  @HostListener('mouseout', ['$event'])
  @HostListener('mouseover', ['$event'])
  @HostListener('mouseup', ['$event'])
  @HostListener('dblclick', ['$event'])
  @HostListener('click', ['$event'])
  onMouseover($event) {
    this.handleFooter();
  }

  handleFooter() {
    if (this.showFooter) {
      // tslint:disable-next-line:no-unused-expression
      this.footerIntervalId && clearInterval(this.footerIntervalId);
    }

    this.showFooter = true;
    this.footerTranslateHeight = 0;
    if (this.currentSpeakerSize.viewSize.height >
      (this.containerHeight - (this.multipleUserInMeeting ? upperPortionHeightInPixel : 0) - 52)) {
      this.speakerBottomPosition = this.footerHeight;
    }
    this.footerIntervalId = setTimeout(() => {
      this.showFooter = false;
      this.speakerBottomPosition = 0;
      this.footerTranslateHeight = this.footerHeight;
    }, 6000);
  }

  ngAfterViewInit() {
    // Only all the there true we can process
    // mobile not able to share the screen
    if (this.deviceCompactbiliy.audio && this.deviceCompactbiliy.video || this.deviceCompactbiliy.screen) {
      // if zoom client is already initialized we directly use join orther we initialize first
      if (this.dataService.firstPath === ROUTEPATH.ZOOMEET) {
        if (this.recipientName) {
          this.userIdentityName = this.recipientName;
          this.initiatedZoom();
        } else {
          this.getNameFromUser();
        }
      } else {
        this.userIdentityName = `${this.ps.profile.firstName} ${this.ps.profile.lastName}`;
        this.initiatedZoom();
      }
    }
  }

  getNameFromUser() {
    const dialogRef = this.dialogService.open(
      ParticipantNameComponent,
      {
        closeOnBackdropClick: false,
        closeOnEsc: false
      }
    );
    dialogRef.onClose.subscribe((res: string) => {
      this.userIdentityName = res;
      this.initiatedZoom();
    });
  }
  @HostListener('window:resize', ['$event'])
  WindowSize($event) {
    this.windowResizer$.next($event.timeStamp);
  }

  calculateLayout() {
    this.containerWidth = this.el.nativeElement.offsetWidth;
    this.containerHeight = window.innerHeight;
    this.speakerBottomPosition = 0;
    this.calculateContainer();
  }

  async adjustLayout() {

    this.calculateLayout();
    // update the canvas size during the resizing
    if (this.particpantsVideoCanvasElem) {
      await this.updateParticipantsCanvasSize();
    }
    // storing the top position user layout, before updating the new view for the eliminate the
    this.rerenderInitiated = true;
    // call the render method for re render based on the current canvas size
    await this.adjustRenderVideo();
  }


  updateParticipantsCanvasSize() {
    return new Promise(async (resolve, reject) => {
      try {
        await this.stream?.updateVideoCanvasDimension(
          this.particpantsVideoCanvasElem.nativeElement,
          this.currentVideoCanvasSize.width, this.currentVideoCanvasSize.height
        );
      } catch (e) {
        this.particpantsVideoCanvasElem.nativeElement.width = this.currentVideoCanvasSize.width;
        this.particpantsVideoCanvasElem.nativeElement.height = this.currentVideoCanvasSize.height;
      }
      resolve(true);
    });
  }


  async ngOnDestroy() {

    try {
      await this.stopRendering();
    } catch (e) {
      console.log(e);
    }
    try {
      await this.client?.leave();
    } catch (e) {
      console.log(e);
    }
    try {
      if (this.isInVBMode && this.imagerUrl && this.imagerUrl !== zoomBlur) {
        URL.revokeObjectURL(this.imagerUrl);
      }
    } catch (e) {
    }
    try {
      ZoomVideo.destroyClient();
    } catch (e) {

    }
    this.client = undefined;
    this.stream = undefined;
    // console.log(this.client);

  }

  /**
   * Initiate zoom
   */
  async initiatedZoom() {

    const initiatedZoom = await this.zoomClientInitiate();

    if (initiatedZoom) {
      return;
    }

    this.joinMeet();
  }

  /**
   * Join meeting
   */
  async joinMeet() {

    const joinedZoom = await this.zoomClientJoin();

    if (typeof joinedZoom === 'object' && (joinedZoom as ExecutedFailure).hasOwnProperty('type')) {
      this.functionError(joinedZoom.reason);
      return;
    }
    // this.zone.runOutsideAngular(() => {
    this.currentSelfParticipant = this.client?.getCurrentUserInfo();
    try {
      this.particpantsVideoCanvasElem.nativeElement.width = this.currentVideoCanvasSize.width;
      this.particpantsVideoCanvasElem.nativeElement.height = this.currentVideoCanvasSize.height;
    } catch (e) {

    }
    // });
  }

  async handleConnections() {

    this.loadingScreen.show = false;

    this.client?.on('active-speaker', (response) => {
      if (this.rerenderInitiated) {
        return;
      }
      if (this.layoutState === MEETINGLAYOUTSTATE.MULTIPLE) {
        this.activeSpeaker$.next(response[0]);
        // this.renderCurrentSpeaker(response[0]);
      }
    });
    this.client?.on('current-audio-change', (payload) => {
      // console.log(`current-audio-change`, payload);
    });
    this.client?.on('user-added', (payload) => {
      console.log('user-added', payload);
      if (this.layoutState === MEETINGLAYOUTSTATE.SINGLE) {
        this.placeParticipantsInFrame();
      } else {
        this.handleIncomingPersonAboveTwo();
      }
    });
    this.client?.on('user-removed', (payload) => this.handleUserRemove(payload));
    this.client?.on('user-updated', (payload) => {
      if (this.rerenderInitiated) {
        return;
      }
      console.log('user-updated', payload);
      this.processUserUpdated(payload);
    });
    this.client.on('video-aspect-ratio-change', async (payload: UserAspectRatio) => {
      console.log('this.currentSpeakerSize', payload);
      if (!this.mobileAndTablet) {
        return;
      }
      this.changeCurrentSpeakerViewForMobile(payload);
    });
    this.client?.on('caption-message', (payload: LiveTranscriptionMessage) => this.handleEventCaptions(payload));
    this.client?.on('passively-stop-share', (payload) => {
      this.stopSelfScreenShare();
    });
    this.client.on('active-share-change', (payload) => {
      console.log(payload);
      // if (payload.state === 'Active') {
      //   stream.startShareView(canvas, payload.userId);
      // } else if (payload.state === 'Inactive') {
      //   stream.stopShareView();
      // }
      this.processScreenShareReceive(payload);
    });
    this.client.on('network-quality-change', (payload) => {
      console.log('network-quality-change', payload);
    });

    // });
  }

  cancel() {
    this.loadingScreen = {
      message: 'Leaving meeting',
      show: true,
      state: lOADINGSCREENSTATE.LEAVE,
    };
    this.goBack();
  }
  invite() {
    const dialogInvite = this.dialogService.open(InviteComponent, { closeOnBackdropClick: false });
    dialogInvite.componentRef.instance.meetingID = this.meetingID;
    dialogInvite.componentRef.instance.userID = this.ps.profile?.userID || this.ps.id;
    dialogInvite.componentRef.instance.degrees = '';
    dialogInvite.componentRef.instance.fromInviteMenu = true;
  }
  inviteInterpreter() {
    const dialogInvite = this.dialogService.open(InterpreterComponent, { closeOnBackdropClick: false });
    dialogInvite.componentRef.instance.encounterID = this.meetingID;
    // dialogInvite.componentRef.instance.userID = this.ps.profile?.userID || this.ps.id;
    // dialogInvite.componentRef.instance.degrees = '';
    // dialogInvite.componentRef.instance.fromInviteMenu = true;
  }

  functionError(message: string) {
    this.loadingScreen = {
      message,
      show: true,
      state: lOADINGSCREENSTATE.ERROR,
    };
  }

  goBack() {
    if (this.dataService.firstPath === ROUTEPATH.ZOOMEET) {
      this.router.navigate([this.dataService.firstPath, this.cs.id, this.ps.id, 'zoom', this.meetingID, 'thankyou']);
    } else {
      this.location.back();
    }
  }

  getUsersOnlySubScriber() {
    // tslint:disable-next-line:triple-equals
    return this.client?.getAllUser();
  }



  stopRendering() {
    return new Promise(async (resolve, reject) => {

      if (this.singleUserState?.userId && this.singleUserState?.video) {
        await this.zoomStopRenderVideo(+this.singleUserState.userId, this.singleUserState?.position?.toString());
        this.singleUserState = undefined;
      }

      if (this.speakerCurrentUserRendering?.userId && this.speakerCurrentUserRendering?.video) {
        await this.zoomStopRenderVideo(+this.speakerCurrentUserRendering.userId,
          this.speakerCurrentUserRendering?.position?.toString()
        );
        this.speakerCurrentUserRendering = undefined;
      }
      resolve(true);
    });
  }

  calculateTopParticipantsForWeb(): ParticipantsTopPosition {
    const bufferSizeFromLayout = 20;
    // for single user view to fit, if width is less then mentioned width
    const containerSingleViewer = this.containerWidth < 580;
    // store the values of lists
    const participants: ParticipantsTopPosition = {};
    // containerSingleViewer is true only, have 1
    // maximum 5 participant only need to show and minimum is one
    const totalViewerListsInTop = containerSingleViewer ? [1] : [1, 2, 3, 4, 5];
    // frameHeight is always same
    const frameheight = upperPortionHeightInPixel;
    // frameWidth is always same
    const frameWidth = upperPortionWidthInPixel;
    // frame Y is always same
    const frameYPosition = (this.containerHeight - upperPortionHeightInPixel);
    // only x is vary so we need to calculate based on the screen
    // so we loop through the total view possibilities
    for (const n of totalViewerListsInTop) {
      // get total width from no of user for a particular view
      const totalWidth = frameWidth * n;
      // bufferWidth for checking spacing available on both sides, in order to check we added totalwidth and frameWidth
      const bufferWidth = containerSingleViewer ? totalWidth : totalWidth + frameWidth + (frameWidth / 2);
      // bufferwidth is greater than the canvas width negalate for further process calibration
      if (bufferWidth > this.containerWidth) {
        // if particuler bufferwidth is met this condition, break out of loop, so no further views can be processed
        break;
      }
      // create a empty object for storing the number of screen per views, key is view number eg: 1
      (participants[n] as OrderParticipantForWebPosition) = {};
      // calculate first tile start position
      const startXPosition = Math.round((this.containerWidth - totalWidth) / 2);
      // added previous button position for the each layout
      const buttonWidth = 32;
      participants[n].previousButton = {
        x: startXPosition - bufferSizeFromLayout - buttonWidth,
      };
      // initialize nextXposition with startXPosition
      let nextXPosition = startXPosition;
      // we loop for the calculating each tile x position
      let i = 1;
      while (i <= n) {
        // store the each tile layout in particular user view
        (participants[n][i] as SingleParticipantPosition) = {
          width: frameWidth,
          height: frameheight,
          y: frameYPosition,
          x: nextXPosition,
          position: 1,
        };
        // increase the next x position for the next tile position
        nextXPosition += frameWidth + gapBetweenTile;
        i++;
      }
      participants[n].numberofView = i - 1;
      // added next button position for the each layout
      participants[n].nextButton = {
        x: (nextXPosition) + (bufferSizeFromLayout - gapBetweenTile),
      };
    }
    return participants;
  }

  calculateTopParticipants(innerWidth: number, innerHeight: number): OrderParticipantForMobilePosition {
    const bufferSizeFromLayout = 20;
    // frameHeight is always same
    const frameheight = upperPortionHeightInPixel;
    // frameWidth is always same
    const frameWidth = upperPortionWidthInPixel;
    // frame Y is always same
    const frameYPosition = (this.containerHeight - innerHeight);
    //
    const n = 1;
    // so we loop through the total view possibilities
    const totalWidth = frameWidth * n;
    // calculate first tile start position
    const startXPosition = Math.round((innerWidth - totalWidth) / 2);
    // added previous button position for the each layout
    const previousButton = {
      x: startXPosition - bufferSizeFromLayout - 32,
    };
    // initialize nextXposition with startXPosition
    let nextXPosition = startXPosition;
    // store the each tile layout in particular user view
    const sizeOfContainer = {
      width: frameWidth,
      height: frameheight,
      y: frameYPosition,
      x: nextXPosition,
      position: 1,
    };
    // increase the next x position for the next tile position
    nextXPosition += frameWidth + gapBetweenTile;   // added next button position for the each layout
    const nextButton = {
      x: (nextXPosition) + 14,
    };
    if (this.mobileAndTablet) {
      previousButton.x = 20;
      nextButton.x = this.containerWidth - 50;
    }
    return { previousButton, sizeOfContainer, nextButton };
  }


  singleUserLayout(innerWidth: number, innerHeight: number) {
    let height = 0;
    let width = 0;
    let x = 0;
    let y = 0;
    let bufferWidth = 20;
    if (this.mobileAndTablet) {
      width = innerWidth;
      height = innerHeight;
      y = 0;
      x = 0;
      return {
        height,
        width,
        x,
        y,
        position: 0,
      };
    }
    if (innerWidth >= 1868) {
      bufferWidth = 200;
    }
    let frameWidth = innerWidth - bufferWidth;
    let frameheight = Math.round((frameWidth / 16) * 9);
    // sometime the frame height will be higher than the innerHeight so the content is hidden
    // in order to prevent the edge case this condition is handled
    if (frameheight >= innerHeight) {
      frameheight = innerHeight;
      frameWidth = Math.round((frameheight / 9) * 16);
      bufferWidth = innerWidth - frameWidth;
    }
    const frameXPosition = Math.round((bufferWidth / 2));
    const frameYPosition = Math.round(((innerHeight - frameheight) / 2));
    height = frameheight;
    width = frameWidth;
    x = frameXPosition;
    y = frameYPosition;
    return {
      height,
      width,
      x,
      y,
      position: 0,
    };
  }

  userSpeakerFrame(innerWidth: number, innerHeight: number) {
    let height = 0;
    let width = 0;
    let x = 0;
    let y = 0;

    if (this.mobileAndTablet) {
      width = innerWidth * 5;
      height = innerHeight * 5;
      y = -(height / 2.5);
      x = -(width / 2.5);
      return {
        height,
        width,
        x,
        y,
        position: 0,
      };
    }


    if (innerWidth >= 1132) {
      let frameWidth = innerWidth;
      let frameheight = Math.round((frameWidth / 16) * 9);
      // sometime the frame height will be higher than the innerHeight so the content is hidden
      // in order to prevent the edge case this condition is handled
      if (frameheight >= innerHeight) {
        frameheight = innerHeight;
        frameWidth = Math.round((frameheight / 9) * 16);
      }
      const frameYPosition = Math.round(innerHeight - frameheight);
      const frameXPosition = Math.round(((innerWidth - frameWidth) / 2));
      height = frameheight;
      width = frameWidth;
      x = frameXPosition;
      y = frameYPosition;
    } else {
      const bufferWidth = 20;
      const frameWidth = innerWidth - bufferWidth;
      const frameheight = Math.round((frameWidth / 16) * 9);
      const frameYPosition = Math.round(innerHeight - frameheight);
      const frameXPosition = Math.round((bufferWidth / 2));
      height = frameheight;
      width = frameWidth;
      x = frameXPosition;
      y = frameYPosition;
    }
    return {
      height,
      width,
      x,
      y,
      position: 0,
    };
  }


  forSpeakerInfoNameShow(videoON: boolean) {
    this.currentActiveSpeakerResponse.videoOff = !videoON;
  }

  forTopUserInfoNameShow(condition: boolean) {
    // this.zone.runOutsideAngular(() => {
    this.topBoxContainer.videoOff = !condition;
    // });
  }


  zoomClientInitiate(): ExecutedResult {
    this.client = ZoomVideo.createClient();
    this.zms.triggerClient(this.client);
    const videoSDKLibDir = 'Global';

    const zmClientInitParams = {
      language: 'en-US',
      dependentAssets: videoSDKLibDir
    };

    return new Promise((resolve, reject) => {
      // this.zone.runOutsideAngular(() => {
      this.client?.init(
        zmClientInitParams.language,
        zmClientInitParams.dependentAssets,
        //   {
        //   enforceMultipleVideos: true,
        //   enforceVirtualBackground: true,
        // }
      )
        .then((response: '') => {
          resolve(response);
        }).catch((error: ExecutedResult) => {
          resolve(error);
        });
      // });
    });
  }

  zoomClientJoin(): ExecutedResult {
    return new Promise(async (resolve, reject) => {

      const tokenGenerated = await this.zms.generateSignatureFromFrontEnd(this.meetingID, 1, this.userIdentityName);
      if (!tokenGenerated.status) {
        resolve({ reason: 'Invalid JWT token', type: 'INVALID_PARAMETERS' });
        return;
      }
      // this.zone.runOutsideAngular(() => {
      this.client?.join(this.meetingID, tokenGenerated.jwt, this.userIdentityName).then(async (response: '') => {

        this.footerComponentInstane.videoElementRefElem = this.videoElementRefElem.nativeElement;

        this.stream = this.client?.getMediaStream();

        this.zms.triggerStream(this.stream);

        this.renderSelfInVideoEl = this.stream?.isRenderSelfViewWithVideoElement();

        this.renderScreenShareSelfVedioEl = this.stream?.isStartShareScreenWithVideoElement();

        this.liveTranscriptionTranslation = this.client.getLiveTranscriptionClient();

        this.translationStatus = this.liveTranscriptionTranslation.getLiveTranscriptionStatus();

        resolve(response);
        // console.log('response', response);
      }).catch((error: ExecutedFailure) => {
        resolve(error);
        // console.log('errorerrorerrorerror', error);
      });
      // });
    });
  }

  zoomRenderVideo(
    canvas: HTMLCanvasElement,
    userId: number,
    width: number,
    height: number,
    x: number,
    y: number,
    videoQuality: VideoQuality,
    additionalUserKey?: string) {

    return new Promise((resolve, reject) => {
      // this.zone.runOutsideAngular(() => {
      this.stream?.renderVideo(canvas, userId, width, height, x, y, videoQuality, additionalUserKey).then(() => {
        resolve(true);
      }).catch((reason: Error) => {
        console.log(reason);
        resolve(true);
      });
      // });
    });
  }
  adjustRenderedVideoPosition(
    canvas: HTMLCanvasElement,
    userId: number,
    width: number,
    height: number,
    x: number,
    y: number,
    additionalUserKey?: string) {

    return new Promise((resolve, reject) => {
      // this.zone.runOutsideAngular(() => {
      this.stream?.adjustRenderedVideoPosition(canvas, userId, width, height, x, y, additionalUserKey).then(() => {
        resolve(true);
      }).catch((reason: Error) => {
        console.log(reason);
        resolve(true);
      });
      // });
    });
  }
  zoomStopRenderVideo(
    userId: number,
    additionalUserKey?: string,
    underlyingColor?: string | UnderlyingColor,
    isKeepLastFrame?: boolean, replacedUserId?: number) {
    return new Promise((resolve, reject) => {
      this.stream?.stopRenderVideo(
        this.particpantsVideoCanvasElem.nativeElement,
        userId,
        additionalUserKey,
        underlyingColor,
        isKeepLastFrame,
        replacedUserId).then(() => {
          resolve(true);
        }).catch((reason: Error) => {
          console.log(reason);
          resolve(true);
        });
    });
  }

  calculateContainer() {
    let thresholdHeight = upperPortionHeightInPixel;

    if (this.mobileAndTablet) {

      thresholdHeight = (innerHeight / 2);

      upperPortionHeightInPixel = thresholdHeight; // that means 3 cm i taken from the zoom meeting reference
      upperPortionWidthInPixel = Math.ceil((upperPortionHeightInPixel / 9) * 16);

    }

    const withoutScreenShare = {
      width: this.containerWidth,
      height: this.containerHeight,
    };
    const withScreenShare = {
      width: this.containerWidth,
      height: thresholdHeight,
    };
    const containerSize = {
      width: this.containerWidth,
      height: this.containerHeight - thresholdHeight,
    };

    const singleUserLayout = this.singleUserLayout(this.containerWidth, this.containerHeight);

    const speakerUserLayout = this.userSpeakerFrame(containerSize.width, containerSize.height);

    console.log('speakerUserLayout', speakerUserLayout);
    this.currentParticipantsTopForMobile = this.calculateTopParticipants(withScreenShare.width, withScreenShare.height);
    this.currentButtonPosition = {
      nextButton: this.currentParticipantsTopForMobile.nextButton,
      previousButton: this.currentParticipantsTopForMobile.previousButton
    };
    this.participantTopForWeb = this.calculateTopParticipantsForWeb();
    console.log('this.calculateTopParticipantsForWeb', this.participantTopForWeb);
    // set screen share view size
    const canvasSize = {
      height: speakerUserLayout.height,
      width: speakerUserLayout.width,
      marginTop: 0,
    };
    if (this.containerWidth <= 1412) {
      canvasSize.marginTop = Math.round(Math.round(canvasSize.height - speakerUserLayout.height) / 2.5);
    }

    this.videoCanvasSize = {
      withoutScreenShare,
      withScreenShare
    };
    this.screenShareSize = {
      canvasSize,
      containerSize,
    };
    this.speakerInfoSize = {
      singleAlone: {
        containerSize: withoutScreenShare,
        viewSize: singleUserLayout,
      },
      multiUse: {
        containerSize,
        viewSize: speakerUserLayout,
      },
    };
    this.currentSpeakerSize = this.multipleUserInMeeting ? this.speakerInfoSize.multiUse : this.speakerInfoSize.singleAlone;
    this.currentVideoCanvasSize = this.isScreenSomeOneSharing ? withScreenShare : withoutScreenShare;
  }

  async handleIncomingPersonAboveTwo() {
    if (!this.layoutState || this.layoutState === MEETINGLAYOUTSTATE.DOUBLE) {
      this.layoutState = MEETINGLAYOUTSTATE.MULTIPLE;
    }
    if (this.mobileAndTablet) {

      this.usersLists = this.client?.getAllUser() || [];

      if (!this.usersLists.length) {
        return;
      }

      this.totalPage = Math.ceil(this.usersLists.length / this.currentLayoutViewNumber);

      this.previousTotalPage = this.totalPage;

      if (!this.showNavigationButtons && this.usersLists.length >= 3) {
        this.showNavigationButtons = true;
      }

    } else {
      if (this.getHowManyUserToView() === this.currentLayoutViewNumber) {

        if (!this.showNavigationButtons && this.getUserLength() > this.currentLayoutViewNumber) {

          this.currentPage = 1;

          this.showNavigationButtons = true;

          this.currentButtonPosition = {
            nextButton: this.currentParticipantsTopForWeb.nextButton,
            previousButton: this.currentParticipantsTopForWeb.previousButton
          };
        }

        this.totalPage = Math.ceil(this.usersLists.length / this.currentLayoutViewNumber);

        if (this.previousTotalPage && this.previousTotalPage === this.totalPage) {
          this.handlePaginationForWeb();
        }

        this.previousTotalPage = this.totalPage;
        return;
      }

      if (this.getHowManyUserToView() > this.currentLayoutViewNumber) {

        this.updateCPTFWAndPaginationPosition(this.getHowManyUserToView());
        // for re adjusting already render users;
        const currentUserIds = this.forWebUserLocalState.map((user) => user.userId);
        // find the index of current users in view of last user index in the original lists;
        const index = this.usersLists.findIndex(value => value.userId === currentUserIds[currentUserIds.length - 1]);
        // check the current users length is less than the updated current layout view number need to fill
        let userToAdd = [];
        if (currentUserIds.length < this.currentLayoutViewNumber) {

          const count = this.currentLayoutViewNumber - currentUserIds.length;

          userToAdd = getNextItemsWithCount(this.usersLists, index, count);

          console.log('userToAdd', userToAdd);
        }
        const currentUserInView = [...this.forWebUserLocalState];
        let layoutPosition = 0;
        for (let i = 0; i < this.forWebUserLocalState.length; i++) {
          layoutPosition = i + 1;
          const layout = JSON.parse(JSON.stringify(this.currentParticipantsTopForWeb[layoutPosition]));
          this.forWebUserLocalState[i].layout = layout;
          const user = this.forWebUserLocalState[i];
          if (user.video) {
            try {
              await this.userToRenderInFrame(false, user.userId, layout);
            } catch (e) {
              console.log('e', e);
            }
          }
        }

        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < userToAdd.length; i++) {
          layoutPosition += 1;
          const user = userToAdd[i];
          const layout = JSON.parse(JSON.stringify(this.currentParticipantsTopForWeb[layoutPosition]));
          if (user.bVideoOn) {
            try {
              await this.userToRenderInFrame(true, user.userId, layout);
            } catch (e) {
              console.log('e', e);
            }
          }
          this.forWebUserLocalState.push({
            audio: !user.muted,
            displayName: user.displayName,
            layout,
            position: layout.position,
            userId: user.userId,
            video: !!user.bVideoOn
          });
        }
      }
    }
  }
  placeParticipantsInFrame() {
    // this.zone.runOutsideAngular(() => {
    this.usersLists = this.client?.getAllUser() || [];
    if (!this.usersLists.length) {
      return;
    }

    if (this.usersLists.length === 1) {
      this.handleSingleUser(true);
      return;
    }

    if (this.usersLists.length > 1) {
      this.handleDoubleUsers();
      return;
    }
    // });
  }

  async adjustRenderVideo() {

    this.currentSpeakerSize = this.multipleUserInMeeting ? this.speakerInfoSize.multiUse : this.speakerInfoSize.singleAlone;

    this.rerenderInitiated = false;

    if (this.multipleUserInMeeting) {

      if (this.mobileAndTablet) {
        const selfUserTopLayout = JSON.parse(JSON.stringify(this.currentParticipantsTopForMobile.sizeOfContainer));

        if (this.mobileAndTablet) {
          this.topBoxContainer.width = this.videoCanvasSize.withScreenShare.width;
          this.topBoxContainer.height = this.videoCanvasSize.withScreenShare.height;
          this.topBoxContainer.x = 0;
        } else {
          this.topBoxContainer.width = this.currentParticipantsTopForMobile.sizeOfContainer.width;
          this.topBoxContainer.height = this.currentParticipantsTopForMobile.sizeOfContainer.height;
          this.topBoxContainer.x = this.currentParticipantsTopForMobile.sizeOfContainer.x;
        }
        if (this.isScreenSomeOneSharing) {
          selfUserTopLayout.y = 0;
        }


        if (this.singleUserState.video) {

          if (this.renderSelfInVideoEl && this.singleUserState?.userId === this.currentSelfParticipant?.userId) {
            this.selfVideoElementSize.hide = false;
          } else {
            const alterLayout = { ...selfUserTopLayout, position: this.singleUserState.position };

            await this.userToRenderInFrame(false, this.singleUserState.userId, alterLayout);
          }
        }

        this.selfVideoElementSize = { ...this.selfVideoElementSize, ...selfUserTopLayout };
      } else {
        if (this.getHowManyUserToView() === this.currentLayoutViewNumber) {

          this.updateCPTFWAndPaginationPosition(this.getHowManyUserToView());

          for (let i = 0; i < this.forWebUserLocalState.length; i++) {
            const value = i;
            const user = this.forWebUserLocalState[value];
            const layout = JSON.parse(JSON.stringify(this.currentParticipantsTopForWeb[value + 1]));

            if (this.isScreenSomeOneSharing) {
              layout.y = 0;
            }
            if (user.video) {
              try {
                await this.userToRenderInFrame(false, user.userId, layout);
              } catch (e) {
                console.log('e', e);
              }
            }
            this.forWebUserLocalState[value].layout = layout;
          }

        } else if (this.getHowManyUserToView() !== this.currentLayoutViewNumber) {

          this.updateCPTFWAndPaginationPosition(this.getHowManyUserToView());

          for (const user of this.forWebUserLocalState) {
            if (user.video) {
              await this.zoomStopRenderVideo(user.userId, user.layout.position.toString());
            }
          }
          this.forWebUserLocalState = [];

          if (this.getUserLength() > this.currentLayoutViewNumber) {

            if (!this.showNavigationButtons) {
              this.showNavigationButtons = true;
            }
          }
          if (this.getUserLength() === this.currentLayoutViewNumber) {
            this.showNavigationButtons = false;
          }
          this.totalPage = Math.ceil(this.usersLists.length / this.currentLayoutViewNumber);
          this.previousTotalPage = this.totalPage;
          this.currentPage = 1;
          const slicedUsers = this.usersLists.slice(0, this.currentLayoutViewNumber);
          for (let i = 0; i < slicedUsers.length; i++) {
            const value = i;
            const user = slicedUsers[value];
            const layout = JSON.parse(JSON.stringify(this.currentParticipantsTopForWeb[value + 1]));
            if (user.bVideoOn) {
              try {
                await this.userToRenderInFrame(true, user.userId, layout);
              } catch (e) {
                console.log('e', e);
              }
            }
            this.forWebUserLocalState.push({
              audio: !user.muted,
              displayName: user.displayName,
              layout,
              position: layout.position,
              userId: user.userId,
              video: !!user.bVideoOn
            });
          }
        }
      }

      if (this.isScreenSomeOneSharing) {
        return;
      }

      if (this.speakerCurrentUserRendering.video) {

        const speakerLayout = JSON.parse(JSON.stringify(this.currentSpeakerSize.viewSize));

        if (this.mobileAndTablet && this.usersAspectRatioMaintain.hasOwnProperty(this.speakerCurrentUserRendering.userId)) {
          const previousAspectRatio = this.usersAspectRatioMaintain[this.speakerCurrentUserRendering.userId];
          speakerLayout.height = previousAspectRatio.height;
          speakerLayout.width = previousAspectRatio.width;
          speakerLayout.y = previousAspectRatio.y;
        }

        await this.userToRenderInFrame(false, this.speakerCurrentUserRendering.userId, speakerLayout);
      }
    } else {

      const layout = this.currentSpeakerSize.viewSize;

      if (this.singleUserState.video) {

        if (this.renderSelfInVideoEl && this.singleUserState?.userId === this.currentSelfParticipant?.userId) {
          this.selfVideoElementSize.hide = false;
        } else {
          const alterLayout = { ...layout, position: this.singleUserState.position };
          await this.userToRenderInFrame(false, this.singleUserState.userId, alterLayout);
        }
      }
      this.selfVideoElementSize = { ...this.selfVideoElementSize, ...layout };

    }
  }

  async handleSingleUser(userAdd: boolean) {
    this.layoutState = MEETINGLAYOUTSTATE.SINGLE;

    this.multipleUserInMeeting = false;

    this.currentSpeakerSize = this.multipleUserInMeeting ? this.speakerInfoSize.multiUse : this.speakerInfoSize.singleAlone;

    const user = this.usersLists[0];

    const layout = this.currentSpeakerSize.viewSize;

    this.singleUserState = {
      video: user.bVideoOn,
      audio: user.muted,
      userId: user.userId,
      position: 1,
    };

    if (this.singleUserState.video) {

      const alterLayout = { ...layout, position: this.singleUserState.position };

      if (this.renderSelfInVideoEl) {
        this.selfVideoElementSize.hide = false;
      } else {
        if (userAdd) {
          await this.userToRenderInFrame(true, user.userId, alterLayout);
        } else {
          await this.userToRenderInFrame(false, user.userId, alterLayout);
        }
      }

    }

    this.selfVideoElementSize = { ...this.selfVideoElementSize, ...layout };

    this.currentParticipantsName.speaker = user.displayName;

    this.forSpeakerInfoNameShow(user.bVideoOn);

    if (this.triggerOnlyFirstTime) {
      this.triggerOnlyFirstTime = false;
      this.handleConnections();
    }
  }

  updateCPTFWAndPaginationPosition(layoutNumber: number) {
    this.currentLayoutViewNumber = layoutNumber;
    this.currentParticipantsTopForWeb = this.participantTopForWeb[this.currentLayoutViewNumber];
    this.currentButtonPosition = {
      nextButton: this.currentParticipantsTopForWeb.nextButton,
      previousButton: this.currentParticipantsTopForWeb.previousButton
    };
  }
  async handleDoubleUsers() {
    this.multipleUserInMeeting = true;

    this.currentSpeakerSize = this.multipleUserInMeeting ? this.speakerInfoSize.multiUse : this.speakerInfoSize.singleAlone;

    this.usersLists = this.client.getAllUser();

    const screenSharorUser = this.usersLists.slice(1).find((user) => user.sharerOn);
    if (screenSharorUser) {
      this.handleScreenShareLayoutAndFirstUserRender(screenSharorUser);
      return;
    }

    if (this.mobileAndTablet) {

      const user1 = this.usersLists[0];

      this.firstUserRender(user1);

    } else {
      this.updateCPTFWAndPaginationPosition(this.getHowManyUserToView());

      if (this.getUserLength() > this.currentLayoutViewNumber) {
        this.showNavigationButtons = true;
        this.totalPage = Math.ceil(this.usersLists.length / this.currentLayoutViewNumber);
        this.previousTotalPage = this.totalPage;
        this.currentPage = 1;

        console.log('this.currentButtonPosition', this.currentButtonPosition);
      }

      const slicedUsers = this.usersLists.slice(0, this.currentLayoutViewNumber);
      this.forWebUserLocalState = [];
      for (let i = 0; i < slicedUsers.length; i++) {
        const value = i;
        const user = slicedUsers[value];
        const layout = JSON.parse(JSON.stringify(this.currentParticipantsTopForWeb[value + 1]));
        let singluserData;
        try {
          singluserData = JSON.parse(JSON.stringify(this.singleUserState));
          this.singleUserState = undefined;
        } catch (e) {
          singluserData = undefined;
        }
        if (singluserData && user.userId === singluserData?.userId && singluserData?.video) {
          try {
            await this.userToRenderInFrame(false, user.userId, layout);
          } catch (e) {
            console.log('e', e);
          }
        } else if (user.bVideoOn) {
          try {
            await this.userToRenderInFrame(true, user.userId, layout);
          } catch (e) {
            console.log('e', e);
          }
        }
        this.forWebUserLocalState.push({
          audio: !user.muted,
          displayName: user.displayName,
          layout,
          position: layout.position,
          userId: user.userId,
          video: !!user.bVideoOn
        });
      }
    }

    let user2: Participant;

    if (this.usersLists.length === 2) {
      user2 = this.usersLists[1];

      this.layoutState = MEETINGLAYOUTSTATE.DOUBLE;
      if (this.mobileAndTablet) {
        this.showNavigationButtons = false;
      }
    } else if (this.usersLists.length > 2) {
      user2 = this.usersLists.slice(1).find(list => !list.muted);

      if (this.mobileAndTablet) {
        this.handleIncomingPersonAboveTwo();
      }
    }

    if (!user2) {
      user2 = this.usersLists[1];
    }
    const speakerLayout = this.currentSpeakerSize.viewSize;


    this.speakerCurrentUserRendering = {
      audio: user2.muted,
      userId: user2.userId,
      video: user2.bVideoOn,
      position: 0

    };

    if (this.speakerCurrentUserRendering.video) {

      await this.userToRenderInFrame(true, user2.userId, speakerLayout);
    }

    this.currentParticipantsName.speaker = user2.displayName;

    this.forSpeakerInfoNameShow(user2.bVideoOn);

    if (this.triggerOnlyFirstTime) {
      this.triggerOnlyFirstTime = false;
      this.handleConnections();
    }
  }

  async renderCurrentSpeaker(speaker: ActiveSpeaker) {
    console.log('speaker-view', speaker.userId);
    const userID = speaker.userId;
    if (userID === this.currentSelfParticipant.userId) {
      return;
    }
    if (this.speakerCurrentUserRendering && this.speakerCurrentUserRendering.userId === userID) {
      return;
    }
    const user = this.client?.getUser(userID);
    const { userId, bVideoOn: video, muted: audio } = user;
    this.currentParticipantsName.speaker = user.displayName;
    if (this.isScreenSomeOneSharing) {
      this.speakerCurrentUserRendering = {
        userId,
        video: video ? true : false,
        audio: audio ? true : false,
        position: 0
      };
      return;
    }
    const previousSpeaker = JSON.parse(JSON.stringify(this.speakerCurrentUserRendering));

    const userLayout = JSON.parse(JSON.stringify(this.speakerInfoSize.multiUse.viewSize));

    if (this.mobileAndTablet && this.usersAspectRatioMaintain.hasOwnProperty(userID)) {
      const previousAspectRatio = this.usersAspectRatioMaintain[userID];
      userLayout.height = previousAspectRatio.height;
      userLayout.width = previousAspectRatio.width;
      userLayout.y = previousAspectRatio.y;
    }


    if (previousSpeaker && previousSpeaker?.video) {
      await this.zoomStopRenderVideo(previousSpeaker.userId, previousSpeaker.position.toString());
    }
    this.speakerCurrentUserRendering = {
      userId,
      video: video ? true : false,
      audio: audio ? true : false,
      position: 0
    };
    if (this.speakerCurrentUserRendering.video) {
      await this.userToRenderInFrame(true,
        this.speakerCurrentUserRendering.userId,
        userLayout
      );
    }

    this.forSpeakerInfoNameShow(this.speakerCurrentUserRendering.video);
  }

  getUserLength() {
    this.usersLists = this.client?.getAllUser();
    return this.usersLists?.length || 0;
  }

  getParticipantsMaxViewAvailable() {
    // tslint:disable-next-line:radix
    return parseInt(Object.keys(this.participantTopForWeb).pop());
  }

  /**
   * @description Find out the number of users can render in screen based
   * on the user count and screen size based view number
   * @returns  layout number to be rendered.
   */
  getHowManyUserToView(): number {
    const usersCount = this.getUserLength();
    // tslint:disable-next-line:radix
    const maxViewNumber = this.getParticipantsMaxViewAvailable();

    return Math.min(usersCount, maxViewNumber);
  }

  checkNeedToShowPagination() {

  }

  userToRenderInFrame(
    newRender: boolean,
    userID: number,
    userLayout: SingleParticipantPosition
  ) {
    return new Promise(async (resolve, reject) => {
      if (newRender) {
        await this.zoomRenderVideo(
          this.particpantsVideoCanvasElem.nativeElement,
          userID,
          userLayout.width,
          userLayout.height,
          userLayout.x,
          userLayout.y,
          userLayout.position === 0 ?
            VideoQuality.Video_720P : VideoQuality.Video_360P,
          userLayout.position.toString(),
        );
      } else {
        await this.adjustRenderedVideoPosition(
          this.particpantsVideoCanvasElem.nativeElement,
          userID,
          userLayout.width,
          userLayout.height,
          userLayout.x,
          userLayout.y,
          userLayout.position.toString()
        );
      }
      resolve(true);
    });
  }

  /**
   * @description To render the changing video participants, including self participants
   * @param userId uniqueid for particular user
   * @param state means vides state active or inactive
   */
  async processTopUserVideoChangeForMobile({ userId, state }) {
    // check current is in the frame for ignore the render
    if (this.singleUserState?.userId === userId || this.speakerCurrentUserRendering?.userId === userId) {
      // this.zone.runOutsideAngular(async () => {
      // check the user in active state for rendering the video in canvas
      if (state === VideoActiveState.Active) {
        this.singleUserState.video = true;

        let layout: ViewSize;
        if (this.layoutState === MEETINGLAYOUTSTATE.SINGLE) {
          layout = { ...this.currentSpeakerSize.viewSize, position: this.singleUserState.position };
        } else {
          layout = this.currentParticipantsTopForMobile.sizeOfContainer;
        }

        await this.userToRenderInFrame(true, userId, layout);

        if (this.layoutState === MEETINGLAYOUTSTATE.SINGLE) {
          this.forSpeakerInfoNameShow(this.singleUserState.video);
          return;
        }

        this.forTopUserInfoNameShow(this.singleUserState.video);
        return;

      } else {
        this.singleUserState.video = false;

        if (this.layoutState === MEETINGLAYOUTSTATE.SINGLE) {

          await this.zoomStopRenderVideo(userId, this.singleUserState.position.toString());
          this.forSpeakerInfoNameShow(this.singleUserState.video);
          return;
        } else {
          await this.zoomStopRenderVideo(userId, this.singleUserState.position.toString());
          this.forTopUserInfoNameShow(this.singleUserState.video);
          return;
        }
      }
      // });
    }
  }

  /**
   * @description To render the changing video participants, including self participants
   * @param userId uniqueid for particular user
   * @param state means vides state active or inactive
   */
  async processTopUserVideoChangeForWeb({ userId, state }) {
    // check current is in the frame for ignore the render
    const topUserMeeting = this.forWebUserLocalState.map((user) => user.userId);
    if (topUserMeeting.includes(userId)) {

      const updatedUserIndex = this.forWebUserLocalState.findIndex((user) => user.userId === userId);

      const updatedUser = this.forWebUserLocalState[updatedUserIndex];

      if (state === VideoActiveState.Active) {

        this.forWebUserLocalState[updatedUserIndex].video = true;

        await this.userToRenderInFrame(true, userId, updatedUser.layout);

      } else {

        this.forWebUserLocalState[updatedUserIndex].video = false;

        await this.zoomStopRenderVideo(userId, updatedUser.layout.position.toString());
      }
    }
  }

  /**
   * @description To render the changing video participants, only speaker participants
   * @param userId uniqueid for speaker user
   * @param state means vides state active or inactive
   */
  async processSpeakerVideoChange({ userId, state }) {
    const video = state === VideoActiveState.Active ? true : false;
    if (this.speakerCurrentUserRendering.video === video) {
      return;
    }
    // check the user in active state for rendering the video in canvas
    if (video) {
      // store the current user layout from the local variable
      const userLayout = JSON.parse(JSON.stringify(this.currentSpeakerSize.viewSize));

      if (this.mobileAndTablet && this.usersAspectRatioMaintain.hasOwnProperty(userId)) {
        const previousAspectRatio = this.usersAspectRatioMaintain[userId];
        if (previousAspectRatio.userId === userId) {
          userLayout.height = previousAspectRatio.height;
          userLayout.width = previousAspectRatio.width;
          userLayout.y = previousAspectRatio.y;
        }
      }
      // for local management
      this.speakerCurrentUserRendering.video = true;
      // rendering the video
      await this.userToRenderInFrame(true, userId, userLayout);
    } else {
      this.zoomStopRenderVideo(userId, this.speakerCurrentUserRendering.position.toString());
      // state is inactive we delete the local memory for particular id
      this.speakerCurrentUserRendering.video = false;
    }
    this.forSpeakerInfoNameShow(this.speakerCurrentUserRendering.video);
  }


  processUserUpdated(receivePayload: ParticipantPropertiesPayload[]) {

    for (const user of receivePayload) {

      if (user.hasOwnProperty('bVideoOn')) {

        const payload = {
          userId: user.userId,
          state: user.bVideoOn ? VideoActiveState.Active : VideoActiveState.Inactive
        };

        if ((this.singleUserState && this.singleUserState?.userId === user.userId)) {

          if (user.userId === this.currentSelfParticipant.userId && this.renderSelfInVideoEl) {

            this.singleUserState.video = user.bVideoOn;

            if (this.multipleUserInMeeting) {
              this.selfVideoElementSize = { ...this.currentParticipantsTopForMobile.sizeOfContainer, hide: !user.bVideoOn };
            } else {
              this.selfVideoElementSize = { ...this.currentSpeakerSize.viewSize, hide: !user.bVideoOn };
            }

            if (this.layoutState === MEETINGLAYOUTSTATE.SINGLE) {
              this.forSpeakerInfoNameShow(this.singleUserState.video);
              return;
            }
            if (this.layoutState === MEETINGLAYOUTSTATE.DOUBLE || this.layoutState === MEETINGLAYOUTSTATE.MULTIPLE) {
              this.forTopUserInfoNameShow(this.singleUserState.video);
            }
            return;
          }

          this.processTopUserVideoChangeForMobile(payload);
        }

        // for web top user placement updated
        if (!this.mobileAndTablet) {
          this.processTopUserVideoChangeForWeb(payload);
        }
        if (this.isScreenSomeOneSharing) {
          return;
        }

        // speaker video changes
        if (this.speakerCurrentUserRendering
          && this.speakerCurrentUserRendering.userId === user.userId) {
          this.processSpeakerVideoChange(payload);
        }
        return;

      }

      if (user.hasOwnProperty('sharerOn')) {
        if (user.userId === this.currentSelfParticipant.userId) {
          return;
        }
        if (!user.sharerOn) {
          return;
        }
        const currentSSU = this.client.getUser(user.userId);

        this.screenShareData = {
          name: currentSSU.displayName,
          userID: currentSSU.userId,
        };
        return;
      }
    }

  }

  handleUserRemove(userDetial: ParticipantPropertiesPayload[]) {
    console.log('user-remove', userDetial);
    if (this.mobileAndTablet) {
      this.handleUserRemoveForMobile(userDetial);
    } else {
      this.handleUserRemoveForWeb(userDetial);
    }
  }
  async handleUserRemoveForWeb(userDetial: ParticipantPropertiesPayload[]) {
    // store the array of id which users left in the meeting state;
    const leftedUserIds = userDetial.map((user) => user.userId);

    // check if current speaker is left during on screen
    if (leftedUserIds.includes(this.speakerCurrentUserRendering?.userId) && this.speakerCurrentUserRendering?.video) {
      // because  called before user remove
      await this.zoomStopRenderVideo(+this.speakerCurrentUserRendering.userId, this.speakerCurrentUserRendering?.position?.toString());
    }

    if (this.layoutState === MEETINGLAYOUTSTATE.DOUBLE) {
      this.singleUserRemainForWeb();
      return;
    }

    if (this.layoutState === MEETINGLAYOUTSTATE.MULTIPLE) {

      this.usersLists = this.client.getAllUser();

      const length = this.usersLists.length;

      if (length >= 2) {

        this.updateCPTFWAndPaginationPosition(this.getHowManyUserToView());

        for (const user of this.forWebUserLocalState) {
          await this.zoomStopRenderVideo(user.userId, user.layout.position.toString());
        }

        if (this.getUserLength() > this.currentLayoutViewNumber) {
          this.showNavigationButtons = true;
          this.totalPage = Math.ceil(this.usersLists.length / this.currentLayoutViewNumber);
          this.previousTotalPage = this.totalPage;
          this.currentPage = 1;

          console.log('this.currentButtonPosition', this.currentButtonPosition);
        }

        const slicedUsers = this.usersLists.slice(0, this.currentLayoutViewNumber);
        this.forWebUserLocalState = [];

        for (let i = 0; i < slicedUsers.length; i++) {
          const value = i;
          const user = slicedUsers[value];
          const layout = JSON.parse(JSON.stringify(this.currentParticipantsTopForWeb[value + 1]));
          if (user.bVideoOn) {
            try {
              await this.userToRenderInFrame(true, user.userId, layout);
            } catch (e) {
              console.log('e', e);
            }
          }
          this.forWebUserLocalState.push({
            audio: !user.muted,
            displayName: user.displayName,
            layout,
            position: layout.position,
            userId: user.userId,
            video: !!user.bVideoOn
          });
        }

        if (leftedUserIds.includes(this.speakerCurrentUserRendering?.userId)) {

          let user2 = this.usersLists.slice(1).find(list => !list.muted);

          if (!user2) {
            user2 = this.usersLists[1];
          }
          const speakerLayout = this.currentSpeakerSize.viewSize;

          this.speakerCurrentUserRendering = {
            audio: user2.muted,
            userId: user2.userId,
            video: user2.bVideoOn,
            position: 0
          };

          if (this.speakerCurrentUserRendering.video) {
            await this.userToRenderInFrame(true, user2.userId, speakerLayout);
          }

          this.currentParticipantsName.speaker = user2.displayName;

          this.forSpeakerInfoNameShow(user2.bVideoOn);
        }

      } else if (length === 1) {
        this.singleUserRemainForWeb();
        return;
      }
    }

  }

  async singleUserRemainForWeb() {
    this.totalPage = 0;
    this.previousTotalPage = 0;
    this.currentPage = 0;
    this.showNavigationButtons = false;
    this.currentLayoutViewNumber = 1;

    for (const user of this.forWebUserLocalState) {
      await this.zoomStopRenderVideo(user.userId, user.layout.position.toString());
    }

    this.usersLists = this.client.getAllUser();

    this.speakerCurrentUserRendering = undefined;

    this.layoutState = MEETINGLAYOUTSTATE.SINGLE;

    this.multipleUserInMeeting = false;

    this.currentSpeakerSize = this.multipleUserInMeeting ? this.speakerInfoSize.multiUse : this.speakerInfoSize.singleAlone;

    const user1 = this.usersLists[0];

    const layout = this.currentSpeakerSize.viewSize;

    this.singleUserState = {
      video: user1.bVideoOn,
      audio: user1.muted,
      userId: user1.userId,
      position: 1,
    };

    if (this.singleUserState.video) {
      await this.userToRenderInFrame(true, user1.userId, layout);

    }

    this.currentParticipantsName.speaker = user1.displayName;

    this.forSpeakerInfoNameShow(user1.bVideoOn);
  }
  async handleUserRemoveForMobile(userDetial: ParticipantPropertiesPayload[]) {

    // store the array of id which users left in the meeting state;
    const leftedUserIds = userDetial.map((user) => user.userId);

    // check if top user is left during on screen
    if (leftedUserIds.includes(this.singleUserState?.userId) && this.singleUserState?.video) {
      // because  called before user remove
      await this.zoomStopRenderVideo(+this.singleUserState.userId, this.singleUserState?.position?.toString());
    }

    // check if current speaker is left during on screen
    if (leftedUserIds.includes(this.speakerCurrentUserRendering?.userId) && this.speakerCurrentUserRendering?.video) {
      // because  called before user remove
      await this.zoomStopRenderVideo(+this.speakerCurrentUserRendering.userId, this.speakerCurrentUserRendering?.position?.toString());
    }

    if (this.layoutState === MEETINGLAYOUTSTATE.DOUBLE) {

      this.usersLists = this.client.getAllUser();

      this.speakerCurrentUserRendering = undefined;

      this.handleSingleUser(false);

      return;
    }

    if (this.layoutState === MEETINGLAYOUTSTATE.MULTIPLE) {

      this.usersLists = this.client.getAllUser();

      const length = this.usersLists.length;

      if (length > 2) {
        // check if current top user is lefted
        if (leftedUserIds.includes(this.singleUserState?.userId)) {
          // just render the first user and reset everything
          const firstUser = this.usersLists[0];

          const selfUserTopLayout = this.currentParticipantsTopForMobile.sizeOfContainer;

          this.singleUserState = {
            audio: firstUser.muted,
            userId: firstUser.userId,
            video: firstUser.bVideoOn,
            position: selfUserTopLayout.position
          };

          this.topBoxContainer.videoOff = !firstUser.bVideoOn;
          this.topBoxContainer.hide = false;
          if (this.mobileAndTablet) {
            this.topBoxContainer.width = this.videoCanvasSize.withScreenShare.width;
            this.topBoxContainer.height = this.videoCanvasSize.withScreenShare.height;
            this.topBoxContainer.x = 0;
          } else {
            this.topBoxContainer.width = this.currentParticipantsTopForMobile.sizeOfContainer.width;
            this.topBoxContainer.height = this.currentParticipantsTopForMobile.sizeOfContainer.height;
            this.topBoxContainer.x = this.currentParticipantsTopForMobile.sizeOfContainer.x;
          }
          this.currentParticipantsName.top = firstUser.displayName;

          if (firstUser && firstUser.bVideoOn) {
            if (this.renderSelfInVideoEl) {
              this.selfVideoElementSize = { ...selfUserTopLayout, hide: false };
            } else {
              await this.userToRenderInFrame(true, firstUser.userId, selfUserTopLayout);
            }
          }

          this.currentPage = 1;
        } else {
          // calculate pagenumber for current top user render
          const currentPageByUser = this.usersLists.findIndex((user) => user.userId === this.singleUserState?.userId);

          this.currentPage = currentPageByUser + 1;
        }

        // check if current speaker is left
        if (leftedUserIds.includes(this.speakerCurrentUserRendering?.userId)) {
          // find another user who is speaking

          let speakerUser = this.usersLists.slice(1).find(list => !list.muted);

          // if not any one speaking forcefully second user will be the speaker user;
          if (!speakerUser) {
            speakerUser = this.usersLists[1];
          }

          this.speakerCurrentUserRendering = {
            audio: speakerUser.muted,
            userId: speakerUser.userId,
            video: speakerUser.bVideoOn,
            position: 0
          };

          this.currentParticipantsName.speaker = speakerUser.displayName;

          if (this.speakerCurrentUserRendering.video) {

            const speakerLayout = this.currentSpeakerSize.viewSize;

            await this.userToRenderInFrame(true, speakerUser.userId, speakerLayout);
          }
          this.forSpeakerInfoNameShow(speakerUser.bVideoOn);
        }

        this.totalPage = Math.ceil(this.usersLists.length / this.currentLayoutViewNumber);

        return;
      }

      // handle only 2 user remaining
      if (length === 2) {

        this.layoutState = MEETINGLAYOUTSTATE.DOUBLE;

        this.showNavigationButtons = false;

        this.totalPage = 1;

        this.currentPage = 1;

        const user1 = this.usersLists[0]; // first user
        const user2 = this.usersLists[1]; // second user


        if (user1?.userId !== this.singleUserState?.userId) {

          const selfUserTopLayout = this.currentParticipantsTopForMobile.sizeOfContainer;

          // check first user is not in the top user
          this.singleUserState = {
            audio: user1.muted,
            userId: user1.userId,
            video: user1.bVideoOn,
            position: selfUserTopLayout.position
          };

          if (user1 && user1.bVideoOn) {

            if (this.renderSelfInVideoEl) {
              this.selfVideoElementSize = { ...selfUserTopLayout, hide: false };
            } else {
              await this.userToRenderInFrame(true, user1.userId, selfUserTopLayout);
            }
          }

          this.topBoxContainer.videoOff = !user1.bVideoOn;
          this.topBoxContainer.hide = false;
          this.currentParticipantsName.top = user1.displayName;
        }

        // check if current speaker is left
        if (user1?.userId !== this.speakerCurrentUserRendering?.userId) {

          const speakerLayout = this.currentSpeakerSize.viewSize;

          // because user-updated called before user remove
          this.speakerCurrentUserRendering = {
            audio: user2.muted,
            userId: user2.userId,
            video: user2.bVideoOn,
            position: 0
          };

          if (this.speakerCurrentUserRendering.video) {
            await this.userToRenderInFrame(true, user2.userId, speakerLayout);
          }

          this.currentParticipantsName.speaker = user2.displayName;

          this.forSpeakerInfoNameShow(user2.bVideoOn);
        }
      }

      // handle only 1 user remaining
      if (length === 1) {

        this.usersLists = this.client.getAllUser();

        this.speakerCurrentUserRendering = undefined;

        this.handleSingleUser(false);

        return;
      }
    }
  }

  async handleScreenShareLayoutAndFirstUserRender(screenSharorUser: Participant) {
    this.isScreenSomeOneSharing = true;

    this.currentVideoCanvasSize = this.isScreenSomeOneSharing ?
      this.videoCanvasSize.withScreenShare : this.videoCanvasSize.withoutScreenShare;

    await this.updateParticipantsCanvasSize();


    if (this.mobileAndTablet) {

      const firstUser = this.usersLists[0];

      this.firstUserRender(firstUser);

    } else {
      this.updateCPTFWAndPaginationPosition(this.getHowManyUserToView());

      if (this.getUserLength() > this.currentLayoutViewNumber) {
        this.showNavigationButtons = true;
        this.totalPage = Math.ceil(this.usersLists.length / this.currentLayoutViewNumber);
        this.previousTotalPage = this.totalPage;
        this.currentPage = 1;

        console.log('this.currentButtonPosition', this.currentButtonPosition);
      }

      const slicedUsers = this.usersLists.slice(0, this.currentLayoutViewNumber);
      this.forWebUserLocalState = [];
      for (let i = 0; i < slicedUsers.length; i++) {
        const value = i;
        const user = slicedUsers[value];
        const layout = JSON.parse(JSON.stringify(this.currentParticipantsTopForWeb[value + 1]));
        layout.y = 0;
        if (this.singleUserState && user.userId === this.singleUserState?.userId && this.singleUserState?.video) {
          try {
            await this.userToRenderInFrame(false, user.userId, layout);
          } catch (e) {
            console.log('e', e);
          }
          this.singleUserState = undefined;
        } else if (user.bVideoOn) {
          try {
            await this.userToRenderInFrame(true, user.userId, layout);
          } catch (e) {
            console.log('e', e);
          }
        }
        this.forWebUserLocalState.push({
          audio: !user.muted,
          displayName: user.displayName,
          layout,
          position: layout.position,
          userId: user.userId,
          video: !!user.bVideoOn
        });
      }
    }
    if (this.usersLists.length === 2) {

      this.layoutState = MEETINGLAYOUTSTATE.DOUBLE;

      this.totalPage = Math.ceil(this.usersLists.length / this.currentLayoutViewNumber);

      this.previousTotalPage = this.totalPage;

      if (this.mobileAndTablet) {
        this.showNavigationButtons = false;
      }

    } else if (this.usersLists.length > 2) {

      if (this.mobileAndTablet) {
        this.handleIncomingPersonAboveTwo();
      }
    }

    this.screenShareData = {
      name: screenSharorUser.displayName,
      userID: screenSharorUser.userId
    };

    this.speakerCurrentUserRendering = {
      audio: screenSharorUser.muted,
      userId: screenSharorUser.userId,
      video: screenSharorUser.bVideoOn,
      position: 0
    };

    this.currentParticipantsName.speaker = screenSharorUser.displayName;

    await this.stream.startShareView(this.screenShareContentRender.nativeElement, screenSharorUser.userId);

    if (this.triggerOnlyFirstTime) {
      this.triggerOnlyFirstTime = false;
      this.handleConnections();
    }
  }

  async firstUserRender(user: Participant) {

    const selfUserTopLayout = JSON.parse(JSON.stringify(this.currentParticipantsTopForMobile.sizeOfContainer));

    if (this.isScreenSomeOneSharing) {
      selfUserTopLayout.y = 0;
    }

    console.log('selfUserTopLayout', selfUserTopLayout);
    if (this.singleUserState && this.singleUserState.video) {

      if (this.renderSelfInVideoEl) {
        this.selfVideoElementSize = { ...selfUserTopLayout, hide: false };
      } else {

        await this.userToRenderInFrame(false, user.userId, { ...selfUserTopLayout, position: this.singleUserState.position });
      }
      this.singleUserState = undefined;

    } else if (user && user.bVideoOn) {

      if (this.renderSelfInVideoEl) {
        this.selfVideoElementSize = { ...selfUserTopLayout, hide: false };
      } else {
        await this.userToRenderInFrame(true, user.userId, selfUserTopLayout);
      }

    }
    this.singleUserState = {
      audio: user.muted,
      userId: user.userId,
      video: user.bVideoOn,
      position: selfUserTopLayout.position
    };

    this.topBoxContainer.videoOff = !user.bVideoOn;
    this.topBoxContainer.hide = false;
    if (this.mobileAndTablet) {
      this.topBoxContainer.width = this.videoCanvasSize.withScreenShare.width;
      this.topBoxContainer.height = this.videoCanvasSize.withScreenShare.height;
      this.topBoxContainer.x = 0;
    } else {
      this.topBoxContainer.width = this.currentParticipantsTopForMobile.sizeOfContainer.width;
      this.topBoxContainer.height = this.currentParticipantsTopForMobile.sizeOfContainer.height;
      this.topBoxContainer.x = this.currentParticipantsTopForMobile.sizeOfContainer.x;
    }
    this.currentParticipantsName.top = user.displayName;
  }

  async processScreenShareReceive(payload: ZoomSharorScreenChange) {
    // if self user is shared the screen don't change the layout
    if (payload.userId === this.currentSelfParticipant.userId) {
      return;
    }
    if (payload.state === 'Active') {
      this.isScreenSomeOneSharing = true;

      if (this.speakerCurrentUserRendering?.video) {
        await this.zoomStopRenderVideo(this.speakerCurrentUserRendering.userId,
          this.speakerCurrentUserRendering.position.toString());
      }
      this.currentVideoCanvasSize = this.isScreenSomeOneSharing ?
        this.videoCanvasSize.withScreenShare : this.videoCanvasSize.withoutScreenShare;
      try {
        await this.updateParticipantsCanvasSize();
      } catch (e) {
        console.log('asdffffffffffffff', e);
      }

      if (this.mobileAndTablet) {
        const selfUserTopLayout = JSON.parse(JSON.stringify(this.currentParticipantsTopForMobile.sizeOfContainer));

        if (this.isScreenSomeOneSharing) {
          selfUserTopLayout.y = 0;
        }

        if (this.singleUserState && this.singleUserState.video) {

          if (this.renderSelfInVideoEl) {
            this.selfVideoElementSize = { ...selfUserTopLayout, hide: false };
          } else {
            try {
              // tslint:disable-next-line:max-line-length
              await this.userToRenderInFrame(false, this.singleUserState.userId, { ...selfUserTopLayout, position: this.singleUserState.position });
            } catch (e) {
              console.log('asdffffffffffff', e);
            }
          }
        }
        if (this.layoutState === MEETINGLAYOUTSTATE.DOUBLE) {

          this.totalPage = Math.ceil(this.usersLists.length / this.currentLayoutViewNumber);

          this.previousTotalPage = this.totalPage;

          this.currentPage = 1;

          this.showNavigationButtons = true;
        }
      } else {
        for (const user of this.forWebUserLocalState) {
          const layout = user.layout;
          layout.y = 0;
          if (user.video) {
            try {
              await this.userToRenderInFrame(false, user.userId, layout);
            } catch (e) {
              console.log('e', e);
            }
          }
        }
      }

      const screenShareParticipant = this.client.getUser(payload.userId);

      this.screenShareData = {
        name: screenShareParticipant.displayName,
        userID: payload.userId
      };
      try {
        await this.stream.startShareView(this.screenShareContentRender.nativeElement, this.screenShareData.userID);
      } catch (e) {
        console.log('error', e);
      }
    } else {
      try {
        await this.stream.stopShareView();
      } catch (e) {
        console.log('error', e);
      }

      this.isScreenSomeOneSharing = false;

      this.currentVideoCanvasSize = this.isScreenSomeOneSharing ?
        this.videoCanvasSize.withScreenShare : this.videoCanvasSize.withoutScreenShare;

      await this.updateParticipantsCanvasSize();

      if (this.mobileAndTablet) {
        if (this.layoutState === MEETINGLAYOUTSTATE.DOUBLE) {

          this.showNavigationButtons = false;

          this.totalPage = 0;

          if (this.currentPage !== 1) {


            const firstUser = this.usersLists[0];

            if (this.singleUserState && this.singleUserState.video) {
              await this.zoomStopRenderVideo(this.singleUserState.userId, this.singleUserState.position.toString());
            }

            this.singleUserState = {
              audio: !firstUser.muted,
              position: 1,
              userId: firstUser.userId,
              video: firstUser.bVideoOn,
            };

            if (this.singleUserState && this.singleUserState.video) {

              const selfUserTopLayout = JSON.parse(JSON.stringify(this.currentParticipantsTopForMobile.sizeOfContainer));

              if (this.renderSelfInVideoEl) {
                this.selfVideoElementSize = { ...selfUserTopLayout, hide: false };
              } else {
                try {
                  // tslint:disable-next-line:max-line-length
                  await this.userToRenderInFrame(true, this.singleUserState.userId, { ...selfUserTopLayout, position: this.singleUserState.position });
                } catch (e) {
                  console.log('asdffffffffffff', e);
                }
              }
            }

            this.currentParticipantsName.top = firstUser.displayName;
            this.topBoxContainer.videoOff = !firstUser.bVideoOn;
            this.topBoxContainer.hide = false;
            if (this.mobileAndTablet) {
              this.topBoxContainer.width = this.videoCanvasSize.withScreenShare.width;
              this.topBoxContainer.height = this.videoCanvasSize.withScreenShare.height;
              this.topBoxContainer.x = 0;
            } else {
              this.topBoxContainer.width = this.currentParticipantsTopForMobile.sizeOfContainer.width;
              this.topBoxContainer.height = this.currentParticipantsTopForMobile.sizeOfContainer.height;
              this.topBoxContainer.x = this.currentParticipantsTopForMobile.sizeOfContainer.x;
            }
          } else {
            if (this.singleUserState && this.singleUserState.video) {

              const selfUserTopLayout = JSON.parse(JSON.stringify(this.currentParticipantsTopForMobile.sizeOfContainer));

              if (this.renderSelfInVideoEl) {
                this.selfVideoElementSize = { ...selfUserTopLayout, hide: false };
              } else {
                try {
                  // tslint:disable-next-line:max-line-length
                  await this.userToRenderInFrame(false, this.singleUserState.userId, { ...selfUserTopLayout, position: this.singleUserState.position });
                } catch (e) {
                  console.log('asdffffffffffff', e);
                }
              }
            }
          }

          this.currentPage = 0;

        }

        if (this.layoutState === MEETINGLAYOUTSTATE.MULTIPLE) {

          if (this.singleUserState && this.singleUserState.video) {

            const selfUserTopLayout = JSON.parse(JSON.stringify(this.currentParticipantsTopForMobile.sizeOfContainer));

            if (this.renderSelfInVideoEl) {
              this.selfVideoElementSize = { ...selfUserTopLayout, hide: false };
            } else {
              try {
                // tslint:disable-next-line:max-line-length
                await this.userToRenderInFrame(false, this.singleUserState.userId, { ...selfUserTopLayout, position: this.singleUserState.position });
              } catch (e) {
                console.log('asdffffffffffff', e);
              }
            }
          }
        }
      } else {
        for (let i = 0; i < this.forWebUserLocalState.length; i++) {
          const layout = JSON.parse(JSON.stringify( this.currentParticipantsTopForWeb[i + 1]));
          this.forWebUserLocalState[i].layout = layout;
          const user = this.forWebUserLocalState[i];
          if (user.video) {
            try {
              await this.userToRenderInFrame(false, user.userId, layout);
            } catch (e) {
              console.log('e', e);
            }
          }
        }
      }


      if (this.speakerCurrentUserRendering?.video) {

        const speakerLayout = this.currentSpeakerSize.viewSize;

        await this.userToRenderInFrame(true, this.speakerCurrentUserRendering.userId, speakerLayout);
      }

      this.forSpeakerInfoNameShow(this.speakerCurrentUserRendering.video);

    }
  }

  handleScreenShare() {
    if (this.screenShare.show) {
      this.stopSelfScreenShare();
    } else {
      this.startSelfScreenShare();
    }
  }

  async stopSelfScreenShare() {
    await this.stream?.stopShareScreen();
    this.screenShare.show = false;
  }

  async startSelfScreenShare() {
    try {
      await this.stream?.startShareScreen(
        this.renderScreenShareSelfVedioEl ?
          this.videoSelfElementRefElem.nativeElement :
          this.selfScreenShareCanvasElemRef.nativeElement
      );
      this.screenShare.show = true;
    } catch (e) {
      this.screenShare.show = false;
    }
  }

  previousUsersToView() {
    if (this.currentPage < 1) {
      return;
    }
    this.currentPage--;
    if (this.mobileAndTablet) {
      this.handlePaginationForMobile(false);
    } else {
      this.handlePaginationForWeb();
    }
  }

  nextUsersToView() {
    if (this.currentPage === this.totalPage) {
      return;
    }
    this.currentPage++;
    if (this.mobileAndTablet) {
      this.handlePaginationForMobile(true);
    } else {
      this.handlePaginationForWeb();
    }
  }

  async handlePaginationForWeb() {
    this.usersLists = this.client.getAllUser();

    const currentUserIds = this.forWebUserLocalState.map((user) => user.userId);

    let startIndex = (this.currentPage - 1) * this.currentLayoutViewNumber;
    let endIndex = startIndex + this.currentLayoutViewNumber;

    startIndex = Math.max(0, Math.min(startIndex, this.usersLists.length));
    endIndex = Math.max(0, Math.min(endIndex, this.usersLists.length));

    const userToDislay = this.usersLists.slice(startIndex, endIndex);

    let remainUserSliced: Participant[] = [];

    if (userToDislay.length < this.currentLayoutViewNumber) {

      const remainUserCount = this.currentLayoutViewNumber - userToDislay.length;

      remainUserSliced = this.forWebUserLocalState.slice(this.forWebUserLocalState.length - remainUserCount)
        .map((user) => this.client.getUser(user.userId));
    }
    const nextUserToView = [...remainUserSliced, ...userToDislay];

    const nextUserToViewIds = nextUserToView.map((user) => user.userId);

    // stop render current user not available in the next list if user is turn on the video
    for (const user of this.forWebUserLocalState) {
      if (!nextUserToViewIds.includes(user.userId) && user.video) {
        try {
          await this.zoomStopRenderVideo(user.userId, user.layout.position.toString());
        } catch (e) {
          console.log('e', e);
        }
      }
    }

    this.forWebUserLocalState = [];
    // new list to iterated for new rendering
    for (let i = 0; i < nextUserToView.length; i++) {
      const user = nextUserToView[i];
      const layout = JSON.parse(JSON.stringify(this.currentParticipantsTopForWeb[i + 1]));

      if (this.isScreenSomeOneSharing) {
        layout.y = 0;
      }
      if (currentUserIds.includes(user.userId)) {
        try {
          await this.userToRenderInFrame(false, user.userId, layout);
        } catch (e) {
          console.log('e', e);
        }
      } else if (user.bVideoOn) {
        try {
          await this.userToRenderInFrame(true, user.userId, layout);
        } catch (e) {
          console.log('e', e);
        }
      }
      this.forWebUserLocalState.push({
        audio: !user.muted,
        displayName: user.displayName,
        layout,
        position: layout.position,
        userId: user.userId,
        video: !!user.bVideoOn
      });
    }
  }

  async handlePaginationForMobile(forward?: boolean) {
    // this.zone.runOutsideAngular(async () => {
    const currentUserId = this.singleUserState?.userId;
    const currentUserIndex = (this.client?.getAllUser() || []).findIndex((list) => list.userId === currentUserId);

    if (currentUserIndex === undefined || currentUserIndex === null) {
      return;
    }

    const nextUser = (this.client?.getAllUser()[forward ? currentUserIndex + 1 : currentUserIndex - 1]);

    if (!nextUser) {
      this.usersLists = this.client?.getAllUser() || [];

      if (!this.usersLists.length) {
        return;
      }

      this.totalPage = Math.ceil(this.usersLists.length / this.currentLayoutViewNumber);

      if (forward) {
        this.currentPage -= this.currentPage;
      } else {
        this.currentPage += this.currentPage;
      }
      return;
      // if (this.currentPage > this.totalPage) {
      //   this.currentPage = this.totalPage;
      // }
    }

    if (this.singleUserState?.video) {

      this.topBoxContainer.videoOff = false;

      if (this.renderSelfInVideoEl && this.singleUserState?.userId === this.currentSelfParticipant?.userId) {

        this.selfVideoElementSize.hide = true;

      } else {

        await this.zoomStopRenderVideo(this.singleUserState.userId, this.singleUserState.position.toString());

      }
    }

    if (nextUser?.bVideoOn) {

      if (this.renderSelfInVideoEl && this.currentSelfParticipant?.userId === nextUser?.userId) {

        this.selfVideoElementSize.hide = false;

      } else {
        const selfUserTopLayout = JSON.parse(JSON.stringify(this.currentParticipantsTopForMobile.sizeOfContainer));
        if (this.isScreenSomeOneSharing) {
          selfUserTopLayout.y = 0;
        }
        await this.userToRenderInFrame(true, nextUser.userId, selfUserTopLayout);
      }
    }

    this.currentParticipantsName.top = nextUser.displayName;
    this.singleUserState.userId = nextUser.userId;
    this.singleUserState.audio = nextUser.muted;
    this.singleUserState.video = nextUser.bVideoOn;
    this.topBoxContainer.videoOff = !nextUser.bVideoOn;
    // });
  }

  handleCaptions() {
    this.captionEnabled = !this.captionEnabled;
  }

  async captionServices() {
    if (!this.client) {
      return;
    }



    if (!this.startedCaptionService) {

      await this.liveTranscriptionTranslation.startLiveTranscription();


      this.startedCaptionService = true;

      this.openDialogForSettingLanguage(false);
    } else {
      this.handleCaptions();
    }
  }


  openDialogForSettingLanguage(FromTemplate: boolean) {
    const dialogRef = this.dialogService.open(CaptionLanguageComponent, {
      closeOnBackdropClick: false,
      closeOnEsc: false
    });
    dialogRef.componentRef.instance.speakingLanguage = this.captionLanguage.speaking;
    dialogRef.componentRef.instance.translationLanguage = this.captionLanguage.translate;
    dialogRef.componentRef.instance.translationStatus = this.translationStatus;
    dialogRef.onClose.subscribe(async (res: CaptionSelectedResponse) => {

      if (res.status) {
        this.captionLanguage = {
          speaking: res.speak,
          translate: res.translate
        };
      }
      try {
        await this.liveTranscriptionTranslation.setSpeakingLanguage(this.captionLanguage.speaking);

        await this.liveTranscriptionTranslation.setTranslationLanguage(this.captionLanguage.translate);
      } catch (e) {
        console.log('asdfffffffffffffffffff', e);
      }


      if (!FromTemplate) {
        this.handleCaptions();
      }

    });
  }

  handleEventCaptions(payload: LiveTranscriptionMessage) {
    if (payload.language !== 400) {
      this.closedCaptions$.next(payload);
    } else {
      // this.closedCaptions$.next(undefined);
    }
  }

  expandOrClose() {
    this.screenShare.expanded = !this.screenShare.expanded;
  }

  async changeCurrentSpeakerViewForMobile(payload: UserAspectRatio) {
    console.log('asdfffffffffffffffffffffffffffffff', payload.userId);
    // if aspect ratio value less than one it will from mobile or tablet
    // if (payload.aspectRatio >= 1.5) {
    //   return;
    // }

    if (this.usersAspectRatioMaintain?.hasOwnProperty(payload.userId)) {
      return;
    }

    const previousAspectRatio = this.usersAspectRatioMaintain[payload.userId];

    if (previousAspectRatio?.aspectRatio === payload.aspectRatio) {
      return;
    }

    if (this.speakerCurrentUserRendering?.userId !== payload.userId) {
      return;
    }

    const { userId, aspectRatio } = payload;

    const containerSize = this.currentSpeakerSize.containerSize;

    // tslint:disable-next-line:prefer-const
    let { width, x, y } = this.currentSpeakerSize.viewSize;

    let height = width / aspectRatio;

    if (height >= containerSize.height) {

      height = containerSize.height;
    }

    y = Math.round(containerSize.height - height);

    this.usersAspectRatioMaintain[userId] = { userId, aspectRatio, width, x, y, height };

    await this.stream?.adjustRenderedVideoPosition(
      this.particpantsVideoCanvasElem.nativeElement,
      userId,
      width,
      height,
      x,
      y,
      this.speakerCurrentUserRendering.position.toString()
    );
  }

  handleButtonClickActions(type: number) {
    switch (type) {
      case 3:
        this.handleScreenShare();
        return;
      case 5:
        this.captionServices();
        return;
      case 6:
        this.openDialogForSettingLanguage(true);
        return;
      case 7:
        this.cancel();
        return;
    }
  }

  userByUserId(index, user: ForwebUserLocalState) {
    return user.userId;
  }

}

/*
  h = (w / 16) * 9
  w = (h / 9) * 16
*/
// Function to get the next items with count
function getNextItemsWithCount(arr: Participant[], index: number, count: number): Participant[] {

  const data = [];

  for (let i = 0; i < count; i++) {
    // Get the next element index
    const nextIndex = (index + i + 1);
    data.push(arr[nextIndex]);
  }

  return data;
}
